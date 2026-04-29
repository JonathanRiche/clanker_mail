//! CLI for sending email through Cloudflare Email Service's REST API.

const std = @import("std");

const VERSION = "0.1.0";
const USER_AGENT = "clanker_mail/" ++ VERSION;
const DEFAULT_READ_LIMIT: usize = 20;
const MAX_READ_LIMIT: usize = 100;
const WORKER_BASE_URL_ENV = "CM_WORKER_BASE_URL";
const WORKER_API_TOKEN_ENV = "CM_WORKER_API_TOKEN";

const ExitCode = enum(u8) {
    ok = 0,
    usage = 2,
    runtime = 1,
};

const AppError = error{
    HelpRequested,
    Usage,
    MissingConfig,
    MissingReadConfig,
    InvalidArgument,
    InvalidCommand,
    InvalidHeader,
    InvalidInteger,
    InvalidMode,
    InvalidUrl,
    MissingValue,
};

const HeaderArg = struct {
    name: []const u8,
    value: []const u8,
};

const Sender = struct {
    address: []const u8,
    name: ?[]const u8 = null,
};

const AttachmentArg = struct {
    path: []const u8,
};

const SendCommand = struct {
    account_id: ?[]const u8 = null,
    api_token: ?[]const u8 = null,
    to: std.ArrayList([]const u8) = .empty,
    cc: std.ArrayList([]const u8) = .empty,
    bcc: std.ArrayList([]const u8) = .empty,
    headers: std.ArrayList(HeaderArg) = .empty,
    attachments: std.ArrayList(AttachmentArg) = .empty,
    from: ?Sender = null,
    reply_to: ?[]const u8 = null,
    subject: ?[]const u8 = null,
    text: ?[]const u8 = null,
    html: ?[]const u8 = null,
    payload_json: ?[]const u8 = null,
    pretty: bool = false,
    dry_run: bool = false,

    fn deinit(self: *SendCommand, allocator: std.mem.Allocator) void {
        self.to.deinit(allocator);
        self.cc.deinit(allocator);
        self.bcc.deinit(allocator);
        self.headers.deinit(allocator);
        self.attachments.deinit(allocator);
    }
};

const ReadListOptions = struct {
    limit: usize = DEFAULT_READ_LIMIT,
};

const ReadGetOptions = struct {
    id: []const u8,
};

const ReadAction = union(enum) {
    list: ReadListOptions,
    get: ReadGetOptions,
};

const ReadCommand = struct {
    worker_base_url: ?[]const u8 = null,
    worker_api_token: ?[]const u8 = null,
    pretty: bool = false,
    action: ReadAction = .{ .list = .{} },
};

const RunContext = struct {
    allocator: std.mem.Allocator,
    http_allocator: std.mem.Allocator,
    io: std.Io,
    stdout: *std.Io.Writer,
    stderr: *std.Io.Writer,
    environ_map: *std.process.Environ.Map,
};

pub fn main(init: std.process.Init) !u8 {
    const arena = init.arena.allocator();
    const io = init.io;

    var stdout_buffer: [4096]u8 = undefined;
    var stdout_writer = std.Io.File.stdout().writer(io, &stdout_buffer);
    defer stdout_writer.interface.flush() catch {};

    var stderr_buffer: [4096]u8 = undefined;
    var stderr_writer = std.Io.File.stderr().writer(io, &stderr_buffer);
    defer stderr_writer.interface.flush() catch {};

    const context: RunContext = .{
        .allocator = arena,
        .http_allocator = init.gpa,
        .io = io,
        .stdout = &stdout_writer.interface,
        .stderr = &stderr_writer.interface,
        .environ_map = init.environ_map,
    };

    const args = try init.minimal.args.toSlice(arena);

    const exit_code = run(context, args) catch |err| {
        if (err != error.HelpRequested) {
            try printError(context.stderr, err);
        }
        return @intFromEnum(exitCodeForError(err));
    };
    return @intFromEnum(exit_code);
}

fn run(context: RunContext, args: []const []const u8) !ExitCode {
    if (args.len <= 1) {
        try writeUsage(context.stdout);
        return .usage;
    }

    const command_name = args[1];
    if (isHelpFlag(command_name)) {
        try writeUsage(context.stdout);
        return .ok;
    }
    if (std.mem.eql(u8, command_name, "version") or std.mem.eql(u8, command_name, "--version")) {
        try context.stdout.print("{s}\n", .{VERSION});
        return .ok;
    }
    if (std.mem.eql(u8, command_name, "read")) {
        return try runRead(context, args[2..]);
    }

    var start_index: usize = 1;
    if (std.mem.eql(u8, command_name, "send")) {
        start_index = 2;
    } else if (!std.mem.startsWith(u8, command_name, "--")) {
        try context.stderr.print("unknown command: {s}\n", .{command_name});
        return error.InvalidCommand;
    }

    var command = SendCommand{};
    defer command.deinit(context.allocator);
    try parseSendArgs(context, args, start_index, &command);
    try applyEnvDefaults(context, &command);
    try validateCommand(command);

    const payload = command.payload_json orelse try buildPayload(context, command);

    if (command.dry_run) {
        try writeJsonOutput(context, payload, command.pretty);
        return .ok;
    }

    const response = try sendRequest(context, command, payload);
    try writeJsonOutput(context, response.body, command.pretty);

    return if (response.status.class() == .success) .ok else .runtime;
}

fn runRead(context: RunContext, args: []const []const u8) !ExitCode {
    var command = ReadCommand{};
    try parseReadArgs(context, args, &command);
    applyReadEnvDefaults(context, &command);
    try validateReadCommand(command);

    const response = try fetchReadRequest(context, command);
    try writeJsonOutput(context, response.body, command.pretty);

    return if (response.status.class() == .success) .ok else .runtime;
}

fn parseSendArgs(
    context: RunContext,
    args: []const []const u8,
    start_index: usize,
    command: *SendCommand,
) !void {
    var index = start_index;
    while (index < args.len) : (index += 1) {
        const arg = args[index];
        if (isHelpFlag(arg)) {
            try writeUsage(context.stdout);
            return error.HelpRequested;
        }
        if (std.mem.eql(u8, arg, "--pretty")) {
            command.pretty = true;
            continue;
        }
        if (std.mem.eql(u8, arg, "--dry-run")) {
            command.dry_run = true;
            continue;
        }
        if (std.mem.eql(u8, arg, "--account-id")) {
            command.account_id = try nextValue(args, &index, "--account-id");
            continue;
        }
        if (std.mem.eql(u8, arg, "--api-token")) {
            command.api_token = try nextValue(args, &index, "--api-token");
            continue;
        }
        if (std.mem.eql(u8, arg, "--to")) {
            try command.to.append(context.allocator, try nextValue(args, &index, "--to"));
            continue;
        }
        if (std.mem.eql(u8, arg, "--cc")) {
            try command.cc.append(context.allocator, try nextValue(args, &index, "--cc"));
            continue;
        }
        if (std.mem.eql(u8, arg, "--bcc")) {
            try command.bcc.append(context.allocator, try nextValue(args, &index, "--bcc"));
            continue;
        }
        if (std.mem.eql(u8, arg, "--from")) {
            const address = try nextValue(args, &index, "--from");
            command.from = .{ .address = address };
            continue;
        }
        if (std.mem.eql(u8, arg, "--from-name")) {
            const name = try nextValue(args, &index, "--from-name");
            if (command.from) |sender| {
                command.from = .{ .address = sender.address, .name = name };
            } else {
                command.from = .{ .address = "", .name = name };
            }
            continue;
        }
        if (std.mem.eql(u8, arg, "--reply-to")) {
            command.reply_to = try nextValue(args, &index, "--reply-to");
            continue;
        }
        if (std.mem.eql(u8, arg, "--subject")) {
            command.subject = try nextValue(args, &index, "--subject");
            continue;
        }
        if (std.mem.eql(u8, arg, "--text")) {
            command.text = try nextValue(args, &index, "--text");
            continue;
        }
        if (std.mem.eql(u8, arg, "--text-file")) {
            command.text = try readInputPath(context, try nextValue(args, &index, "--text-file"));
            continue;
        }
        if (std.mem.eql(u8, arg, "--html")) {
            command.html = try nextValue(args, &index, "--html");
            continue;
        }
        if (std.mem.eql(u8, arg, "--html-file")) {
            command.html = try readInputPath(context, try nextValue(args, &index, "--html-file"));
            continue;
        }
        if (std.mem.eql(u8, arg, "--header")) {
            try command.headers.append(context.allocator, try parseHeaderArg(try nextValue(args, &index, "--header")));
            continue;
        }
        if (std.mem.eql(u8, arg, "--attach")) {
            try command.attachments.append(context.allocator, .{
                .path = try nextValue(args, &index, "--attach"),
            });
            continue;
        }
        if (std.mem.eql(u8, arg, "--payload-json")) {
            command.payload_json = try nextValue(args, &index, "--payload-json");
            continue;
        }
        if (std.mem.eql(u8, arg, "--payload-file")) {
            command.payload_json = try readInputPath(context, try nextValue(args, &index, "--payload-file"));
            continue;
        }

        try context.stderr.print("unknown argument: {s}\n", .{arg});
        return error.InvalidArgument;
    }
}

fn parseReadArgs(
    context: RunContext,
    args: []const []const u8,
    command: *ReadCommand,
) !void {
    var index: usize = 0;
    if (args.len != 0 and !std.mem.startsWith(u8, args[0], "--")) {
        const subcommand = args[0];
        if (isHelpFlag(subcommand)) {
            try writeReadUsage(context.stdout);
            return error.HelpRequested;
        }
        if (std.mem.eql(u8, subcommand, "list")) {
            index = 1;
        } else if (std.mem.eql(u8, subcommand, "get")) {
            if (args.len < 2 or std.mem.startsWith(u8, args[1], "--")) {
                return error.Usage;
            }
            command.action = .{ .get = .{ .id = args[1] } };
            index = 2;
        } else {
            try context.stderr.print("unknown read command: {s}\n", .{subcommand});
            return error.InvalidCommand;
        }
    }

    while (index < args.len) : (index += 1) {
        const arg = args[index];
        if (isHelpFlag(arg)) {
            try writeReadUsage(context.stdout);
            return error.HelpRequested;
        }
        if (std.mem.eql(u8, arg, "--pretty")) {
            command.pretty = true;
            continue;
        }
        if (std.mem.eql(u8, arg, "--worker-base-url")) {
            command.worker_base_url = try nextValue(args, &index, "--worker-base-url");
            continue;
        }
        if (std.mem.eql(u8, arg, "--worker-api-token")) {
            command.worker_api_token = try nextValue(args, &index, "--worker-api-token");
            continue;
        }
        if (std.mem.eql(u8, arg, "--limit")) {
            switch (command.action) {
                .list => |*options| {
                    options.limit = try parseReadLimit(try nextValue(args, &index, "--limit"));
                },
                .get => return error.InvalidArgument,
            }
            continue;
        }

        return error.InvalidArgument;
    }
}

fn applyEnvDefaults(context: RunContext, command: *SendCommand) !void {
    if (command.account_id == null) {
        command.account_id = context.environ_map.get("CLOUDFLARE_ACCOUNT_ID");
    }
    if (command.api_token == null) {
        command.api_token = context.environ_map.get("CLOUDFLARE_API_TOKEN");
    }
}

fn applyReadEnvDefaults(context: RunContext, command: *ReadCommand) void {
    if (command.worker_base_url == null) {
        command.worker_base_url = context.environ_map.get(WORKER_BASE_URL_ENV);
    }
    if (command.worker_api_token == null) {
        command.worker_api_token = context.environ_map.get(WORKER_API_TOKEN_ENV);
    }
}

fn validateCommand(command: SendCommand) !void {
    if (command.payload_json != null) {
        if (command.to.items.len != 0 or
            command.cc.items.len != 0 or
            command.bcc.items.len != 0 or
            command.from != null or
            command.reply_to != null or
            command.subject != null or
            command.text != null or
            command.html != null or
            command.headers.items.len != 0 or
            command.attachments.items.len != 0)
        {
            return error.InvalidMode;
        }
    } else {
        if (command.to.items.len == 0) return error.Usage;
        if (command.from == null) return error.Usage;
        if (command.from.?.address.len == 0) return error.Usage;
        if (command.subject == null) return error.Usage;
        if (command.text == null and command.html == null) return error.Usage;
    }

    if (!command.dry_run) {
        if (command.account_id == null or command.account_id.?.len == 0) {
            return error.MissingConfig;
        }
        if (command.api_token == null or command.api_token.?.len == 0) {
            return error.MissingConfig;
        }
    }
}

fn validateReadCommand(command: ReadCommand) !void {
    if (command.worker_base_url == null or command.worker_base_url.?.len == 0) {
        return error.MissingReadConfig;
    }
    if (command.worker_api_token == null or command.worker_api_token.?.len == 0) {
        return error.MissingReadConfig;
    }

    const worker_base_url = command.worker_base_url.?;
    const uri = std.Uri.parse(worker_base_url) catch return error.InvalidUrl;
    if (uri.scheme.len == 0 or uri.host == null) {
        return error.InvalidUrl;
    }
}

fn buildPayload(context: RunContext, command: SendCommand) ![]const u8 {
    var buffer: std.Io.Writer.Allocating = .init(context.allocator);
    defer buffer.deinit();

    var writer: std.json.Stringify = .{
        .writer = &buffer.writer,
        .options = .{ .whitespace = .minified },
    };

    try writer.beginObject();
    try writeEmailListField(&writer, "to", command.to.items);
    if (command.cc.items.len != 0) {
        try writeEmailListField(&writer, "cc", command.cc.items);
    }
    if (command.bcc.items.len != 0) {
        try writeEmailListField(&writer, "bcc", command.bcc.items);
    }
    try writeSenderField(&writer, command.from.?);
    if (command.reply_to) |reply_to| {
        try writer.objectField("reply_to");
        try writer.write(reply_to);
    }
    try writer.objectField("subject");
    try writer.write(command.subject.?);

    if (command.text) |text| {
        try writer.objectField("text");
        try writer.write(text);
    }
    if (command.html) |html| {
        try writer.objectField("html");
        try writer.write(html);
    }
    if (command.headers.items.len != 0) {
        try writer.objectField("headers");
        try writer.beginObject();
        for (command.headers.items) |header| {
            try writer.objectField(header.name);
            try writer.write(header.value);
        }
        try writer.endObject();
    }
    if (command.attachments.items.len != 0) {
        try writeAttachmentsField(context, &writer, command.attachments.items);
    }
    try writer.endObject();

    return try buffer.toOwnedSlice();
}

fn writeEmailListField(
    writer: *std.json.Stringify,
    field_name: []const u8,
    addresses: []const []const u8,
) !void {
    std.debug.assert(addresses.len != 0);
    try writer.objectField(field_name);
    if (addresses.len == 1) {
        try writer.write(addresses[0]);
        return;
    }

    try writer.beginArray();
    for (addresses) |address| {
        try writer.write(address);
    }
    try writer.endArray();
}

fn writeSenderField(writer: *std.json.Stringify, sender: Sender) !void {
    try writer.objectField("from");
    if (sender.name) |name| {
        try writer.beginObject();
        try writer.objectField("address");
        try writer.write(sender.address);
        try writer.objectField("name");
        try writer.write(name);
        try writer.endObject();
        return;
    }
    try writer.write(sender.address);
}

fn writeAttachmentsField(
    context: RunContext,
    writer: *std.json.Stringify,
    attachments: []const AttachmentArg,
) !void {
    try writer.objectField("attachments");
    try writer.beginArray();

    for (attachments) |attachment| {
        const file_bytes = try std.Io.Dir.cwd().readFileAlloc(
            context.io,
            attachment.path,
            context.allocator,
            .unlimited,
        );
        const encoded_size = std.base64.standard.Encoder.calcSize(file_bytes.len);
        const encoded = try context.allocator.alloc(u8, encoded_size);
        _ = std.base64.standard.Encoder.encode(encoded, file_bytes);

        try writer.beginObject();
        try writer.objectField("content");
        try writer.write(encoded);
        try writer.objectField("filename");
        try writer.write(std.fs.path.basename(attachment.path));
        try writer.objectField("type");
        // Defaulting to octet-stream keeps the simple CLI path predictable.
        try writer.write("application/octet-stream");
        try writer.objectField("disposition");
        try writer.write("attachment");
        try writer.endObject();
    }

    try writer.endArray();
}

const HttpResponse = struct {
    status: std.http.Status,
    body: []const u8,
};

fn fetchReadRequest(context: RunContext, command: ReadCommand) !HttpResponse {
    const url = try buildReadUrl(context.allocator, command);
    const auth_header = try std.fmt.allocPrint(
        context.allocator,
        "Bearer {s}",
        .{command.worker_api_token.?},
    );

    var client: std.http.Client = .{
        .allocator = context.http_allocator,
        .io = context.io,
    };
    defer client.deinit();

    var response_buffer: std.Io.Writer.Allocating = .init(context.allocator);
    defer response_buffer.deinit();

    const result = try client.fetch(.{
        .location = .{ .url = url },
        .method = .GET,
        .headers = .{
            .authorization = .{ .override = auth_header },
            .user_agent = .{ .override = USER_AGENT },
        },
        .response_writer = &response_buffer.writer,
    });

    return .{
        .status = result.status,
        .body = try response_buffer.toOwnedSlice(),
    };
}

fn sendRequest(context: RunContext, command: SendCommand, payload: []const u8) !HttpResponse {
    const url = try std.fmt.allocPrint(
        context.allocator,
        "https://api.cloudflare.com/client/v4/accounts/{s}/email/sending/send",
        .{command.account_id.?},
    );
    const auth_header = try std.fmt.allocPrint(context.allocator, "Bearer {s}", .{command.api_token.?});

    var client: std.http.Client = .{
        .allocator = context.http_allocator,
        .io = context.io,
    };
    defer client.deinit();

    var response_buffer: std.Io.Writer.Allocating = .init(context.allocator);
    defer response_buffer.deinit();

    const result = try client.fetch(.{
        .location = .{ .url = url },
        .method = .POST,
        .payload = payload,
        .headers = .{
            .authorization = .{ .override = auth_header },
            .content_type = .{ .override = "application/json" },
            .user_agent = .{ .override = USER_AGENT },
        },
        .response_writer = &response_buffer.writer,
    });

    return .{
        .status = result.status,
        .body = try response_buffer.toOwnedSlice(),
    };
}

fn buildReadUrl(allocator: std.mem.Allocator, command: ReadCommand) ![]const u8 {
    const base_url = std.mem.trimEnd(u8, command.worker_base_url.?, "/");

    return switch (command.action) {
        .list => |options| std.fmt.allocPrint(
            allocator,
            "{s}/api/messages?limit={d}",
            .{ base_url, options.limit },
        ),
        .get => |options| std.fmt.allocPrint(
            allocator,
            "{s}/api/messages/{s}",
            .{ base_url, options.id },
        ),
    };
}

fn writeJsonOutput(context: RunContext, body: []const u8, pretty: bool) !void {
    if (!pretty) {
        try context.stdout.writeAll(body);
        if (body.len == 0 or body[body.len - 1] != '\n') {
            try context.stdout.writeByte('\n');
        }
        return;
    }

    const parsed = std.json.parseFromSliceLeaky(std.json.Value, context.allocator, body, .{}) catch {
        try context.stdout.writeAll(body);
        if (body.len == 0 or body[body.len - 1] != '\n') {
            try context.stdout.writeByte('\n');
        }
        return;
    };

    var writer: std.json.Stringify = .{
        .writer = context.stdout,
        .options = .{ .whitespace = .indent_2 },
    };
    try writer.write(parsed);
    try context.stdout.writeByte('\n');
}

fn nextValue(args: []const []const u8, index: *usize, option_name: []const u8) ![]const u8 {
    index.* += 1;
    if (index.* >= args.len) {
        return error.MissingValue;
    }
    const value = args[index.*];
    if (value.len == 0) {
        return error.MissingValue;
    }
    if (std.mem.startsWith(u8, value, "--")) {
        _ = option_name;
        return error.MissingValue;
    }
    return value;
}

fn parseHeaderArg(raw: []const u8) !HeaderArg {
    const colon_index = std.mem.indexOfScalar(u8, raw, ':') orelse return error.InvalidHeader;
    const name = std.mem.trim(u8, raw[0..colon_index], " \t");
    const value = std.mem.trim(u8, raw[colon_index + 1 ..], " \t");
    if (name.len == 0 or value.len == 0) {
        return error.InvalidHeader;
    }
    return .{
        .name = name,
        .value = value,
    };
}

fn parseReadLimit(raw: []const u8) !usize {
    const limit = std.fmt.parseUnsigned(usize, raw, 10) catch return error.InvalidInteger;
    if (limit == 0 or limit > MAX_READ_LIMIT) {
        return error.InvalidInteger;
    }
    return limit;
}

fn readInputPath(context: RunContext, path: []const u8) ![]const u8 {
    if (std.mem.eql(u8, path, "-")) {
        var stdin_buffer: [4096]u8 = undefined;
        var stdin_reader = std.Io.File.stdin().reader(context.io, &stdin_buffer);
        var writer: std.Io.Writer.Allocating = .init(context.allocator);
        defer writer.deinit();
        _ = try stdin_reader.interface.streamRemaining(&writer.writer);
        return try writer.toOwnedSlice();
    }

    return try std.Io.Dir.cwd().readFileAlloc(context.io, path, context.allocator, .unlimited);
}

fn printError(stderr: *std.Io.Writer, err: anyerror) !void {
    switch (err) {
        error.HelpRequested => {},
        error.Usage => try stderr.writeAll("missing required arguments; run with --help for usage\n"),
        error.MissingConfig => try stderr.writeAll(
            "missing Cloudflare credentials; set --account-id/--api-token or CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN\n",
        ),
        error.MissingReadConfig => try stderr.writeAll(
            "missing worker read config; set --worker-base-url/--worker-api-token or CM_WORKER_BASE_URL/CM_WORKER_API_TOKEN\n",
        ),
        error.InvalidArgument => try stderr.writeAll("invalid argument\n"),
        error.InvalidCommand => try stderr.writeAll("invalid command; run with --help for usage\n"),
        error.InvalidHeader => try stderr.writeAll("invalid --header value; expected 'Name: Value'\n"),
        error.InvalidInteger => try stderr.writeAll("invalid integer value\n"),
        error.InvalidMode => try stderr.writeAll("raw payload mode cannot be mixed with message-building flags\n"),
        error.InvalidUrl => try stderr.writeAll("invalid worker base URL\n"),
        error.MissingValue => try stderr.writeAll("option is missing a value\n"),
        else => try stderr.print("error: {s}\n", .{@errorName(err)}),
    }
}

fn exitCodeForError(err: anyerror) ExitCode {
    return switch (err) {
        error.HelpRequested => .ok,
        error.Usage,
        error.InvalidArgument,
        error.InvalidCommand,
        error.InvalidHeader,
        error.InvalidInteger,
        error.InvalidMode,
        error.InvalidUrl,
        error.MissingValue,
        => .usage,
        error.MissingConfig,
        error.MissingReadConfig,
        => .runtime,
        else => .runtime,
    };
}

fn writeUsage(stdout: *std.Io.Writer) !void {
    try stdout.writeAll(
        \\clanker_mail sends email through the Cloudflare Email Service REST API
        \\and can read archived inbound mail from a deployed clanker_mail worker.
        \\
        \\Usage:
        \\  clanker_mail send [options]
        \\  clanker_mail read [list] [options]
        \\  clanker_mail read get <id> [options]
        \\  clanker_mail [options]
        \\
        \\Send config:
        \\  --account-id <id>        Cloudflare account ID
        \\  --api-token <token>      Cloudflare API token
        \\                           Environment fallbacks:
        \\                           CLOUDFLARE_ACCOUNT_ID
        \\                           CLOUDFLARE_API_TOKEN
        \\
        \\Read config:
        \\  --worker-base-url <url>  Worker base URL such as https://cm.example.workers.dev
        \\  --worker-api-token <tok> Worker bearer token
        \\                           Environment fallbacks:
        \\                           CM_WORKER_BASE_URL
        \\                           CM_WORKER_API_TOKEN
        \\
        \\Message mode:
        \\  --to <email>             Repeat for multiple recipients
        \\  --cc <email>             Optional; repeatable
        \\  --bcc <email>            Optional; repeatable
        \\  --from <email>           Sender address
        \\  --from-name <name>       Optional sender display name
        \\  --reply-to <email>       Optional reply-to address
        \\  --subject <text>         Subject line
        \\  --text <body>            Plain text body
        \\  --text-file <path|->     Read plain text body from file or stdin
        \\  --html <body>            HTML body
        \\  --html-file <path|->     Read HTML body from file or stdin
        \\  --header 'Name: Value'   Custom header; repeatable
        \\  --attach <path>          Attach a file as application/octet-stream
        \\
        \\Raw payload mode:
        \\  --payload-json <json>    Send an exact Cloudflare request body
        \\  --payload-file <path|->  Read the JSON body from file or stdin
        \\
        \\Read mode:
        \\  read list                List recent archived messages
        \\  read get <id>            Fetch one archived message in detail
        \\  --limit <count>          Only for read list; 1-100 (default 20)
        \\
        \\Output:
        \\  --pretty                 Pretty-print JSON output
        \\  --dry-run                Print the request payload instead of sending
        \\  --help                   Show this help
        \\  --version                Show the CLI version
        \\
        \\Examples:
        \\  clanker_mail send \
        \\    --from welcome@example.com \
        \\    --to user@example.com \
        \\    --subject 'Welcome' \
        \\    --text 'Thanks for signing up.'
        \\
        \\  clanker_mail read list --pretty
        \\
        \\  clanker_mail read get 550e8400-e29b-41d4-a716-446655440000 --pretty
        \\
        \\  clanker_mail --payload-file payload.json --pretty
        \\
    );
}

fn writeReadUsage(stdout: *std.Io.Writer) !void {
    try stdout.writeAll(
        \\Read archived inbound mail from a deployed clanker_mail worker.
        \\
        \\Usage:
        \\  clanker_mail read [list] [options]
        \\  clanker_mail read get <id> [options]
        \\
        \\Config:
        \\  --worker-base-url <url>  Worker base URL such as https://cm.example.workers.dev
        \\  --worker-api-token <tok> Worker bearer token
        \\                           Environment fallbacks:
        \\                           CM_WORKER_BASE_URL
        \\                           CM_WORKER_API_TOKEN
        \\
        \\Commands:
        \\  list                     List recent archived messages
        \\  get <id>                 Fetch one archived message in detail
        \\
        \\Options:
        \\  --limit <count>          Only for list; 1-100 (default 20)
        \\  --pretty                 Pretty-print JSON output
        \\  --help                   Show this help
        \\
    );
}

fn isHelpFlag(arg: []const u8) bool {
    return std.mem.eql(u8, arg, "--help") or std.mem.eql(u8, arg, "-h") or std.mem.eql(u8, arg, "help");
}

test "parse header argument trims whitespace" {
    const header = try parseHeaderArg("List-Unsubscribe: <https://example.com/unsub>");
    try std.testing.expectEqualStrings("List-Unsubscribe", header.name);
    try std.testing.expectEqualStrings("<https://example.com/unsub>", header.value);
}

test "write email list field uses array when needed" {
    var writer_buffer: std.Io.Writer.Allocating = .init(std.testing.allocator);
    defer writer_buffer.deinit();

    var writer: std.json.Stringify = .{
        .writer = &writer_buffer.writer,
        .options = .{ .whitespace = .minified },
    };

    try writer.beginObject();
    try writeEmailListField(&writer, "to", &.{ "a@example.com", "b@example.com" });
    try writer.endObject();

    const json = try writer_buffer.toOwnedSlice();
    defer std.testing.allocator.free(json);
    try std.testing.expectEqualStrings("{\"to\":[\"a@example.com\",\"b@example.com\"]}", json);
}

test "validate command rejects mixed raw payload mode" {
    var command = SendCommand{};
    defer command.deinit(std.testing.allocator);
    command.payload_json = "{}";
    try command.to.append(std.testing.allocator, "user@example.com");
    try std.testing.expectError(error.InvalidMode, validateCommand(command));
}

test "parse read args defaults to list mode" {
    var stdout_buffer: [256]u8 = undefined;
    var stdout_writer = std.Io.Writer.fixed(&stdout_buffer);

    var stderr_buffer: [256]u8 = undefined;
    var stderr_writer = std.Io.Writer.fixed(&stderr_buffer);

    var env_map = std.process.Environ.Map.init(std.testing.allocator);
    defer env_map.deinit();

    const context: RunContext = .{
        .allocator = std.testing.allocator,
        .http_allocator = std.testing.allocator,
        .io = undefined,
        .stdout = &stdout_writer,
        .stderr = &stderr_writer,
        .environ_map = &env_map,
    };

    var command = ReadCommand{};
    try parseReadArgs(context, &.{ "--limit", "5", "--pretty" }, &command);

    try std.testing.expect(command.pretty);
    switch (command.action) {
        .list => |options| try std.testing.expectEqual(@as(usize, 5), options.limit),
        .get => return error.TestUnexpectedResult,
    }
}

test "parse read args accepts get subcommand" {
    var stdout_buffer: [256]u8 = undefined;
    var stdout_writer = std.Io.Writer.fixed(&stdout_buffer);

    var stderr_buffer: [256]u8 = undefined;
    var stderr_writer = std.Io.Writer.fixed(&stderr_buffer);

    var env_map = std.process.Environ.Map.init(std.testing.allocator);
    defer env_map.deinit();

    const context: RunContext = .{
        .allocator = std.testing.allocator,
        .http_allocator = std.testing.allocator,
        .io = undefined,
        .stdout = &stdout_writer,
        .stderr = &stderr_writer,
        .environ_map = &env_map,
    };

    var command = ReadCommand{};
    try parseReadArgs(context, &.{ "get", "message-123", "--pretty" }, &command);

    switch (command.action) {
        .get => |options| try std.testing.expectEqualStrings("message-123", options.id),
        .list => return error.TestUnexpectedResult,
    }
    try std.testing.expect(command.pretty);
}

test "build read url trims trailing slash" {
    const command: ReadCommand = .{
        .worker_base_url = "https://mail.example.workers.dev/",
        .worker_api_token = "token",
        .action = .{ .list = .{ .limit = 3 } },
    };

    const url = try buildReadUrl(std.testing.allocator, command);
    defer std.testing.allocator.free(url);

    try std.testing.expectEqualStrings(
        "https://mail.example.workers.dev/api/messages?limit=3",
        url,
    );
}
