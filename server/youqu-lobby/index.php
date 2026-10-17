<?php
// 有趣网址之家上已经挂着的房间。GitHub 预览页不连这里。
// 规则和 tools/room.mjs 对齐。改房间行为时两处一起改。这次不传到主机。
// 后台名单在 Cloudflare 房间。这里只认 state 里已经写上的 maxPeople 和 kicks。
// 来访记录也只在那间房间，这里不记。
declare(strict_types=1);

const MAX_PEOPLE = 24;
const LOG_MAX = 40;
const STALE_MS = 90000;
// 与 js/score.js 的 SCORE_MS 相同。没另存曲目时用这份总长。曲目或时长变了要一起改。
const SCORE_MS = 1622062;
// 和 js/layout.js 的 RECEPTION 同一块：南墙到第一道墙，两根柱子内侧。
const RECEPTION_MIN_X = -8.2;
const RECEPTION_MAX_X = 8.2;
const RECEPTION_MIN_Z = -9.8;
const RECEPTION_MAX_Z = 4.0;

header("X-Robots-Tag: noindex");
header("X-Content-Type-Options: nosniff");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("X-LiteSpeed-Cache-Control: no-cache");
header("CDN-Cache-Control: no-store");

$origin = isset($_SERVER["HTTP_ORIGIN"]) ? (string) $_SERVER["HTTP_ORIGIN"] : "";
if (originOk($origin)) {
    header("Access-Control-Allow-Origin: " . $origin);
    header("Vary: Origin");
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    header("Access-Control-Max-Age: 86400");
}

if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
    http_response_code(originOk($origin) ? 204 : 403);
    exit;
}

if (($_SERVER["REQUEST_METHOD"] ?? "") === "GET") {
    header("Content-Type: text/plain; charset=utf-8");
    echo "sitopia lobby";
    exit;
}

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    http_response_code(405);
    exit;
}

if (!originOk($origin)) {
    http_response_code(403);
    header("Content-Type: text/plain; charset=utf-8");
    echo "forbidden";
    exit;
}

$raw = file_get_contents("php://input");
if (!is_string($raw) || strlen($raw) > 8192) {
    http_response_code(413);
    exit;
}

$body = json_decode($raw, true);
if (!is_array($body)) $body = [];
$msgs = [];
if (isset($body["msgs"]) && is_array($body["msgs"])) {
    $msgs = array_slice($body["msgs"], 0, 6);
}
$wantId = isset($body["id"]) && is_string($body["id"]) && preg_match("/^[0-9a-f]{6}$/", $body["id"]) ? $body["id"] : "";

$dir = dirname(__DIR__, 2) . "/sitopia-lobby-data";
if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
    http_response_code(500);
    header("Content-Type: text/plain; charset=utf-8");
    echo "lobby data";
    exit;
}

$lockPath = $dir . "/room.lock";
$statePath = $dir . "/state.json";
$lock = fopen($lockPath, "c");
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    if (is_resource($lock)) fclose($lock);
    respond(429, ["busy" => true]);
}

$data = loadState($statePath);
if (!isset($data["robot"]) || !is_array($data["robot"])) $data["robot"] = blankRobot();
else $data["robot"] = normalizeRobot($data["robot"]);
if (!isset($data["notes"]) || !is_array($data["notes"])) $data["notes"] = [];
$now = (int) round(microtime(true) * 1000);
$ip = clientIp();
if (!rateOk($data, $ip, $now)) {
    saveState($statePath, $data);
    flock($lock, LOCK_UN);
    fclose($lock);
    respond(429, ["busy" => true]);
}

sweep($data, $now);
$booted = syncMusic($data, $now);
if ($booted) deliver($data, "", [["who" => "all", "obj" => $booted]]);

$seat = "";
if (isset($body["seat"]) && is_string($body["seat"])) $seat = cleanSeat($body["seat"]);
if ($seat === "") {
    foreach ($msgs as $msg) {
        if (!is_array($msg) || ($msg["t"] ?? "") !== "hi") continue;
        $seat = cleanSeat($msg["seat"] ?? "");
        if ($seat !== "") break;
    }
}
if ($seat !== "") {
    $match = findSeat($data["people"], $seat);
    if ($match !== "") $wantId = $match;
}

$created = false;
if ($wantId === "" || !isset($data["people"][$wantId])) {
    $wantId = newId($data["people"]);
    $data["people"][$wantId] = blankPerson($wantId, $now);
    $data["queues"][$wantId] = [];
    $created = true;
}

if ($seat !== "" && isset($data["people"][$wantId])) {
    $data["people"][$wantId]["seat"] = $seat;
    foreach (array_keys($data["people"]) as $pid) {
        if ((string) $pid === (string) $wantId) continue;
        if (($data["people"][$pid]["seat"] ?? "") !== $seat) continue;
        $other = $data["people"][$pid];
        unset($data["people"][$pid], $data["queues"][$pid]);
        if (empty($other["named"]) || !empty($other["away"]) || !empty($other["gone"])) continue;
        deliver($data, (string) $wantId, [[
            "who" => "all",
            "obj" => [
                "t" => "bye",
                "id" => $other["id"],
                "name" => $other["name"],
                "n" => namedCount($data["people"]),
            ],
        ]]);
    }
}

$id = $wantId;
$data["people"][$id]["seen"] = $now;
$closing = false;

foreach ($msgs as $msg) {
    if (!is_array($msg) || !isset($msg["t"]) || !is_string($msg["t"])) continue;
    if (!isset($data["people"][$id])) break;
    if ($msg["t"] === "leave") {
        deliver($data, $id, onLeave($data, $id));
        $closing = true;
        break;
    }
    $result = onClientMessage($data["people"], $data["log"], $data["people"][$id], $msg, $now, $data);
    $turned = syncRobot($data);
    if ($turned) $result["out"][] = ["who" => "all", "obj" => $turned];
    if (!$result["close"]) {
        $ev = syncMusic($data, $now);
        if ($ev) $result["out"][] = ["who" => "all", "obj" => $ev];
        stampMusic($result["out"], $data, $now);
        attachDesk($result["out"], $data);
    }
    deliver($data, $id, $result["out"]);
    if ($result["close"]) {
        if (isset($data["people"][$id])) deliver($data, $id, onLeave($data, $id));
        $ev = syncMusic($data, $now);
        if ($ev) deliver($data, "", [["who" => "all", "obj" => $ev]]);
        $closing = true;
        break;
    }
}

$events = [];
if (isset($data["queues"][$id])) {
    $events = $data["queues"][$id];
    $data["queues"][$id] = [];
}
if ($closing) {
    unset($data["queues"][$id]);
}

saveState($statePath, $data);
flock($lock, LOCK_UN);
fclose($lock);

respond(200, [
    "id" => $id,
    "events" => $events,
    "close" => $closing,
    "fresh" => $created,
]);

function originOk(string $origin): bool {
    if ($origin === "https://wenxiuncle.github.io") return true;
    if ($origin === "https://youquhome.com" || $origin === "https://www.youquhome.com") return true;
    return (bool) preg_match("#^http://(127\\.0\\.0\\.1|localhost)(:\\d+)?$#", $origin);
}

function clientIp(): string {
    $ip = $_SERVER["HTTP_CF_CONNECTING_IP"] ?? $_SERVER["REMOTE_ADDR"] ?? "";
    $ip = is_string($ip) ? trim($ip) : "";
    if (strlen($ip) > 64) $ip = substr($ip, 0, 64);
    return $ip === "" ? "0" : $ip;
}

function respond(int $status, array $payload): void {
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function loadState(string $path): array {
    $empty = ["people" => [], "queues" => [], "log" => [], "hits" => []];
    if (!is_file($path)) return $empty;
    $raw = file_get_contents($path);
    if (!is_string($raw) || $raw === "") return $empty;
    $data = json_decode($raw, true);
    if (!is_array($data)) return $empty;
    foreach (["people", "queues", "log", "hits"] as $key) {
        if (!isset($data[$key]) || !is_array($data[$key])) $data[$key] = [];
    }
    return $data;
}

function saveState(string $path, array $data): void {
    $tmp = $path . ".tmp";
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE));
    rename($tmp, $path);
}

function rateOk(array &$data, string $ip, int $now): bool {
    $keep = [];
    foreach ($data["hits"] as $key => $times) {
        if (!is_array($times)) continue;
        $fresh = [];
        foreach ($times as $at) {
            if ($now - (int) $at < 1000) $fresh[] = (int) $at;
        }
        if ($fresh) $keep[(string) $key] = $fresh;
    }
    $mine = $keep[$ip] ?? [];
    if (count($mine) >= 12) {
        $data["hits"] = $keep;
        return false;
    }
    if (!isset($keep[$ip]) && count($keep) >= 100) {
        $data["hits"] = $keep;
        return false;
    }
    $mine[] = $now;
    $keep[$ip] = $mine;
    $data["hits"] = $keep;
    return true;
}

function newId(array $people): string {
    for ($n = 0; $n < 5; $n++) {
        $id = bin2hex(random_bytes(3));
        if (!isset($people[$id])) return $id;
    }
    return bin2hex(random_bytes(3));
}

function blankPerson(string $id, int $now): array {
    return [
        "id" => $id,
        "name" => "",
        "named" => false,
        "x" => 0,
        "y" => 0,
        "z" => 15.5,
        "yaw" => 0,
        "away" => false,
        "seat" => "",
        "seen" => $now,
        "lastMove" => 0,
        "lastSay" => 0,
        "lastName" => 0,
        "lastNote" => 0,
        "lastRobot" => 0,
        "gone" => false,
    ];
}

function uSlice(string $text, int $n): string {
    if (function_exists("mb_substr")) return mb_substr($text, 0, $n, "UTF-8");
    return substr($text, 0, $n);
}

function cleanSeat($value): string {
    $text = strtolower(trim((string) $value));
    return preg_match("/^[0-9a-f]{8,32}$/", $text) ? $text : "";
}

function findSeat(array $people, string $seat): string {
    if ($seat === "") return "";
    $found = "";
    $foundNamed = false;
    $foundSeen = -1;
    foreach ($people as $pid => $person) {
        if (!is_array($person) || !empty($person["gone"])) continue;
        if (($person["seat"] ?? "") !== $seat) continue;
        $named = !empty($person["named"]);
        $seen = (int) ($person["seen"] ?? 0);
        $better = $found === ""
            || ($named && !$foundNamed)
            || ($named === $foundNamed && $seen >= $foundSeen);
        if (!$better) continue;
        $found = (string) $pid;
        $foundNamed = $named;
        $foundSeen = $seen;
    }
    return $found;
}

function withSeat(array $item, array $person): array {
    if (!empty($person["seat"])) $item["seat"] = $person["seat"];
    return $item;
}

function presentJoin(array $person, array $people): array {
    return withSeat([
        "t" => "join",
        "id" => $person["id"],
        "name" => $person["name"],
        "x" => $person["x"],
        "y" => $person["y"] ?? 0,
        "z" => $person["z"],
        "yaw" => $person["yaw"],
        "n" => namedCount($people),
    ], $person);
}

function cleanName($value): string {
    $text = uSlice(trim(preg_replace("/[\\x00-\\x1F]/", "", (string) $value) ?? ""), 12);
    return $text === "" ? "访客" : $text;
}

function cleanText($value): string {
    return uSlice(trim(preg_replace("/[\\x00-\\x1F]/", "", (string) $value) ?? ""), 80);
}

function cleanPose(array $msg): ?array {
    if (!isset($msg["x"], $msg["z"], $msg["yaw"])) return null;
    if (!is_int($msg["x"]) && !is_float($msg["x"])) return null;
    if (!is_int($msg["z"]) && !is_float($msg["z"])) return null;
    if (!is_int($msg["yaw"]) && !is_float($msg["yaw"])) return null;
    $y = 0.0;
    if (isset($msg["y"])) {
        if (!is_int($msg["y"]) && !is_float($msg["y"])) return null;
        $y = (float) $msg["y"];
    }
    $x = (float) $msg["x"];
    $z = (float) $msg["z"];
    $yaw = (float) $msg["yaw"];
    if ($x < -40 || $x > 40 || $z < -50 || $z > 40 || $y < -1 || $y > 90) return null;
    $yaw = atan2(sin($yaw), cos($yaw));
    return [
        "x" => round($x, 3),
        "y" => round($y, 3),
        "z" => round($z, 3),
        "yaw" => round($yaw, 3),
    ];
}

function peopleLimit(array $data): int {
    $n = (int) ($data["maxPeople"] ?? MAX_PEOPLE);
    if ($n < 1 || $n > MAX_PEOPLE) return MAX_PEOPLE;
    return $n;
}

function kickUntil(array $data, string $seat, int $now): int {
    if ($seat === "" || !isset($data["kicks"]) || !is_array($data["kicks"])) return 0;
    $until = (int) ($data["kicks"][$seat] ?? 0);
    return $until > $now ? $until : 0;
}

function namedCount(array $people): int {
    $n = 0;
    foreach ($people as $person) {
        if (!empty($person["named"]) && empty($person["away"]) && empty($person["gone"])) $n++;
    }
    return $n;
}

// 与 js/layout.js 的 occupiesHall 同一条界：展厅和轿厢算在里面，广场和观景台不算。
function occupiesHall($x, $z): bool {
    if (!is_numeric($x) || !is_numeric($z)) return false;
    $x = (float) $x;
    $z = (float) $z;
    if ($x > -18.24 && $x < -15.62 && $z > -4.65 && $z < -0.85) return true;
    if ($x < -18.48 || $x > 18.33) return false;
    if ($z < -34.23 || $z >= 4.48) return false;
    return true;
}

function musicTracks(array $music): array {
    if (empty($music["tracks"]) || !is_array($music["tracks"])) return [];
    $out = [];
    foreach ($music["tracks"] as $item) {
        if (!is_array($item)) continue;
        $file = isset($item["file"]) ? (string) $item["file"] : "";
        $ms = isset($item["ms"]) ? (int) $item["ms"] : 0;
        if ($file === "" || strpbrk($file, "/\\") !== false || strpos($file, "..") !== false) continue;
        if ($ms < 1000 || $ms > 3600000) continue;
        $row = ["file" => $file, "ms" => $ms];
        if (isset($item["on"]) && $item["on"] === false) $row["on"] = false;
        $out[] = $row;
        if (count($out) >= 40) break;
    }
    return $out;
}

function musicPlayable(array $music): array {
    $out = [];
    foreach (musicTracks($music) as $item) {
        if (isset($item["on"]) && $item["on"] === false) continue;
        $out[] = ["file" => $item["file"], "ms" => $item["ms"]];
    }
    return $out;
}

function musicTotal(array $music): int {
    $all = musicTracks($music);
    if (!$all) return SCORE_MS;
    $n = 0;
    foreach (musicPlayable($music) as $item) $n += $item["ms"];
    return $n;
}

function musicVolume(array $music): int {
    if (!isset($music["volume"])) return 100;
    $n = (int) $music["volume"];
    if ((string) $n !== (string) $music["volume"] && !is_int($music["volume"])) return 100;
    return $n >= 0 && $n <= 100 ? $n : 100;
}

function wrapScore(int $ms, int $total = SCORE_MS): int {
    if ($total < 1) $total = SCORE_MS;
    $n = $ms % $total;
    if ($n < 0) $n += $total;
    return $n;
}

function musicPos(array $music, int $now): int {
    $pos = (int) ($music["pos"] ?? 0);
    if (!empty($music["playing"])) $pos += $now - (int) ($music["at"] ?? $now);
    $total = musicTotal($music);
    if ($total < 1) return 0;
    return wrapScore($pos, $total);
}

function musicView(array $music, int $now): array {
    $view = [
        "t" => "music",
        "pos" => musicPos($music, $now),
        "playing" => !empty($music["playing"]),
        "at" => $now,
        "volume" => musicVolume($music),
    ];
    $stored = musicTracks($music);
    if ($stored) $view["tracks"] = musicPlayable($music);
    return $view;
}

function hallOccupied(array $people): bool {
    foreach ($people as $person) {
        if (!is_array($person) || empty($person["named"]) || !empty($person["away"]) || !empty($person["gone"])) continue;
        if (occupiesHall($person["x"] ?? null, $person["z"] ?? null)) return true;
    }
    return false;
}

function syncMusic(array &$data, int $now): ?array {
    if (!isset($data["people"]) || !is_array($data["people"])) $data["people"] = [];
    if (!isset($data["music"]) || !is_array($data["music"])) {
        $data["music"] = ["pos" => 0, "at" => $now, "playing" => false];
    }
    $playing = !empty($data["music"]["playing"]);
    $want = hallOccupied($data["people"]);
    if ($want === $playing) return null;
    if ($playing) $data["music"]["pos"] = musicPos($data["music"], $now);
    $data["music"]["playing"] = $want;
    $data["music"]["at"] = $now;
    return musicView($data["music"], $now);
}

function stampMusic(array &$events, array &$data, int $now): void {
    if (!isset($data["music"]) || !is_array($data["music"])) {
        $data["music"] = ["pos" => 0, "at" => $now, "playing" => false];
    }
    $view = musicView($data["music"], $now);
    foreach ($events as &$ev) {
        if (!is_array($ev) || !isset($ev["obj"]) || !is_array($ev["obj"])) continue;
        if (($ev["obj"]["t"] ?? "") === "welcome") $ev["obj"]["music"] = $view;
    }
    unset($ev);
}

function snapshot(array $people, string $exceptId): array {
    $list = [];
    foreach ($people as $person) {
        if (($person["id"] ?? "") === $exceptId || empty($person["named"]) || !empty($person["away"]) || !empty($person["gone"])) continue;
        $list[] = withSeat([
            "id" => $person["id"],
            "name" => $person["name"],
            "x" => $person["x"],
            "y" => $person["y"] ?? 0,
            "z" => $person["z"],
            "yaw" => $person["yaw"],
        ], $person);
    }
    return $list;
}

function uniqueName(array $people, string $name, string $exceptId): string {
    $used = [];
    foreach ($people as $person) {
        if (($person["id"] ?? "") === $exceptId || empty($person["named"]) || !empty($person["gone"])) continue;
        $used[$person["name"]] = true;
    }
    if (!isset($used[$name])) return $name;
    for ($i = 2; $i < 100; $i++) {
        $next = uSlice($name . $i, 12);
        if (!isset($used[$next])) return $next;
    }
    return uSlice($name, 8) . "客";
}

function onLeave(array &$data, string $id): array {
    if (!isset($data["people"][$id])) return [];
    $person = $data["people"][$id];
    if (!empty($person["gone"])) return [];
    $announce = !empty($person["named"]) && empty($person["away"]);
    $name = (string) ($person["name"] ?? "");
    unset($data["people"][$id]);
    $out = [];
    if ($announce) {
        $out[] = [
            "who" => "all",
            "obj" => ["t" => "bye", "id" => $id, "name" => $name, "n" => namedCount($data["people"])],
        ];
    }
    $turned = syncRobot($data);
    if ($turned) $out[] = ["who" => "all", "obj" => $turned];
    return $out;
}

function blankRobot(): array {
    return ["x" => 0.0, "z" => -2.9, "yaw" => M_PI, "driver" => "", "moving" => false, "poseAt" => 0];
}

function cleanRobotPose(array $msg): ?array {
    $x = isset($msg["x"]) ? (float) $msg["x"] : NAN;
    $z = isset($msg["z"]) ? (float) $msg["z"] : NAN;
    $yaw = isset($msg["yaw"]) ? (float) $msg["yaw"] : NAN;
    if (!is_finite($x) || !is_finite($z) || !is_finite($yaw)) return null;
    if ($x < RECEPTION_MIN_X + 0.2 || $x > RECEPTION_MAX_X - 0.2) return null;
    if ($z < RECEPTION_MIN_Z + 0.2 || $z > RECEPTION_MAX_Z - 0.2) return null;
    $yaw = atan2(sin($yaw), cos($yaw));
    return ["x" => round($x, 3), "z" => round($z, 3), "yaw" => round($yaw, 3)];
}

function normalizeRobot(array $saved): array {
    $robot = blankRobot();
    $pose = cleanRobotPose($saved);
    if ($pose) {
        $robot["x"] = $pose["x"];
        $robot["z"] = $pose["z"];
        $robot["yaw"] = $pose["yaw"];
    }
    return $robot;
}

function robotView(array $robot): array {
    return [
        "t" => "robot",
        "x" => $robot["x"],
        "z" => $robot["z"],
        "yaw" => $robot["yaw"],
        "driver" => (string) ($robot["driver"] ?? ""),
        "moving" => !empty($robot["moving"]),
    ];
}

function electDriver(array $people): string {
    $best = null;
    foreach ($people as $person) {
        if (empty($person["named"]) || !empty($person["away"]) || !empty($person["gone"])) continue;
        if ($best === null) {
            $best = $person;
            continue;
        }
        $entered = (int) ($person["entered"] ?? 0);
        $bestEntered = (int) ($best["entered"] ?? 0);
        $earlier = $entered < $bestEntered;
        $tie = $entered === $bestEntered && strcmp((string) $person["id"], (string) $best["id"]) < 0;
        if ($earlier || $tie) $best = $person;
    }
    return $best ? (string) $best["id"] : "";
}

function syncRobot(array &$data): ?array {
    if (!isset($data["robot"]) || !is_array($data["robot"])) $data["robot"] = blankRobot();
    $driver = electDriver($data["people"] ?? []);
    $moving = $driver !== "";
    $same = ($data["robot"]["driver"] ?? "") === $driver && !empty($data["robot"]["moving"]) === $moving;
    if ($same) return null;
    $data["robot"]["driver"] = $driver;
    $data["robot"]["moving"] = $moving;
    return robotView($data["robot"]);
}

function takeRobotPose(array &$data, array &$person, array $msg, int $now): ?array {
    if (empty($data["robot"]["moving"])) return null;
    if ((string) ($person["id"] ?? "") !== (string) ($data["robot"]["driver"] ?? "")) return null;
    if ($now - (int) ($person["lastRobot"] ?? 0) < 80) return null;
    $pose = cleanRobotPose($msg);
    if ($pose === null) return null;
    $person["lastRobot"] = $now;
    $data["robot"]["x"] = $pose["x"];
    $data["robot"]["z"] = $pose["z"];
    $data["robot"]["yaw"] = $pose["yaw"];
    $data["robot"]["poseAt"] = $now;
    return ["who" => "others", "obj" => robotView($data["robot"])];
}

function cleanNoteText($value): string {
    $text = str_replace(["\r", "\n", "\t"], " ", (string) $value);
    $text = preg_replace('/[\x00-\x1f]/u', "", $text);
    if (!is_string($text)) $text = "";
    $text = trim($text);
    return uSlice($text, 120);
}

function addNote(array &$data, array &$person, $text, int $now): ?array {
    if (!empty($person["away"])) return null;
    if ($now - (int) ($person["lastNote"] ?? 0) < 2500) return null;
    $clean = cleanNoteText($text);
    if ($clean === "") return null;
    $person["lastNote"] = $now;
    $note = [
        "id" => (string) $person["id"] . "-" . $now,
        "name" => (string) ($person["name"] ?? "访客"),
        "text" => $clean,
        "at" => $now,
    ];
    $data["notes"][] = $note;
    if (count($data["notes"]) > 200) $data["notes"] = array_slice($data["notes"], -200);
    return ["t" => "note", "id" => $note["id"], "name" => $note["name"], "text" => $note["text"], "at" => $note["at"]];
}

function attachDesk(array &$events, array $data): void {
    foreach ($events as &$ev) {
        if (!isset($ev["obj"]) || !is_array($ev["obj"])) continue;
        if (($ev["obj"]["t"] ?? "") !== "welcome") continue;
        $ev["obj"]["robot"] = robotView($data["robot"]);
        $ev["obj"]["notes"] = array_values($data["notes"]);
    }
}

function deliver(array &$data, string $selfId, array $events): void {
    foreach ($events as $ev) {
        if (!isset($ev["who"], $ev["obj"]) || !is_array($ev["obj"])) continue;
        foreach ($data["people"] as $pid => $person) {
            if (!empty($person["gone"])) continue;
            $isSelf = $pid === $selfId;
            if ($ev["who"] === "self" && !$isSelf) continue;
            if ($ev["who"] === "others" && $isSelf) continue;
            if (!isset($data["queues"][$pid]) || !is_array($data["queues"][$pid])) $data["queues"][$pid] = [];
            $data["queues"][$pid][] = $ev["obj"];
        }
    }
}

function sweep(array &$data, int $now): void {
    $ids = array_keys($data["people"]);
    foreach ($ids as $id) {
        $seen = (int) ($data["people"][$id]["seen"] ?? 0);
        if ($now - $seen <= STALE_MS) continue;
        deliver($data, (string) $id, onLeave($data, (string) $id));
    }
}

function onClientMessage(array &$people, array &$log, array &$person, array $msg, int $now, array &$room): array {
    $out = [];
    if (($msg["t"] ?? "") === "pong") {
        if (!empty($person["named"])) {
            $person["seen"] = $now;
            $person["pings"] = true;
        }
        return ["close" => false, "out" => $out];
    }
    $person["seen"] = $now;
    if ($msg["t"] === "hi") {
        $got = cleanSeat($msg["seat"] ?? "");
        if ($got !== "") $person["seat"] = $got;
        $until = $room ? kickUntil($room, (string) ($person["seat"] ?? ""), $now) : 0;
        if ($until > 0) {
            return ["close" => true, "out" => [["who" => "self", "obj" => ["t" => "kick", "until" => $until]]]];
        }
        if (!empty($person["named"])) {
            if (empty($person["entered"])) $person["entered"] = $now;
            $wasAway = !empty($person["away"]);
            $person["away"] = ($msg["away"] ?? false) === true;
            $welcome = [
                "t" => "welcome",
                "id" => $person["id"],
                "name" => $person["name"],
                "away" => $person["away"],
                "resume" => true,
                "n" => namedCount($people),
                "people" => snapshot($people, (string) $person["id"]),
                "log" => array_values($log),
            ];
            $out[] = ["who" => "self", "obj" => $welcome];
            if ($wasAway && empty($person["away"])) $out[] = ["who" => "others", "obj" => presentJoin($person, $people)];
            elseif (!$wasAway && !empty($person["away"])) {
                $out[] = ["who" => "others", "obj" => ["t" => "bye", "id" => $person["id"], "name" => $person["name"], "n" => namedCount($people)]];
            }
            return ["close" => false, "out" => $out];
        }
        $limit = $room ? peopleLimit($room) : MAX_PEOPLE;
        if (namedCount($people) >= $limit) {
            return ["close" => true, "out" => [["who" => "self", "obj" => ["t" => "full"]]]];
        }
        $person["name"] = uniqueName($people, cleanName($msg["name"] ?? ""), (string) $person["id"]);
        $person["named"] = true;
        if (empty($person["entered"])) $person["entered"] = $now;
        $person["away"] = ($msg["away"] ?? false) === true;
        $out[] = [
            "who" => "self",
            "obj" => [
                "t" => "welcome",
                "id" => $person["id"],
                "name" => $person["name"],
                "away" => $person["away"],
                "n" => namedCount($people),
                "people" => snapshot($people, (string) $person["id"]),
                "log" => array_values($log),
            ],
        ];
        if (empty($person["away"])) $out[] = ["who" => "others", "obj" => presentJoin($person, $people)];
        return ["close" => false, "out" => $out];
    }
    if (empty($person["named"])) return ["close" => false, "out" => $out];
    if ($msg["t"] === "away") {
        if (!empty($person["away"])) return ["close" => false, "out" => $out];
        $person["away"] = true;
        $out[] = ["who" => "others", "obj" => ["t" => "bye", "id" => $person["id"], "name" => $person["name"], "n" => namedCount($people)]];
        return ["close" => false, "out" => $out];
    }
    if ($msg["t"] === "back") {
        if (empty($person["away"])) return ["close" => false, "out" => $out];
        $person["away"] = false;
        $out[] = ["who" => "others", "obj" => presentJoin($person, $people)];
        return ["close" => false, "out" => $out];
    }
    if ($msg["t"] === "name") {
        if ($now - (int) $person["lastName"] < 400) return ["close" => false, "out" => $out];
        $next = uniqueName($people, cleanName($msg["name"] ?? ""), (string) $person["id"]);
        if ($next === $person["name"]) return ["close" => false, "out" => $out];
        $person["lastName"] = $now;
        $person["name"] = $next;
        $note = ["t" => "name", "id" => $person["id"], "name" => $person["name"]];
        $out[] = ["who" => !empty($person["away"]) ? "self" : "all", "obj" => $note];
        return ["close" => false, "out" => $out];
    }
    if ($msg["t"] === "move") {
        if ($now - (int) $person["lastMove"] < 45) return ["close" => false, "out" => $out];
        $pose = cleanPose($msg);
        if ($pose === null) return ["close" => false, "out" => $out];
        $person["lastMove"] = $now;
        $person["x"] = $pose["x"];
        $person["y"] = $pose["y"];
        $person["z"] = $pose["z"];
        $person["yaw"] = $pose["yaw"];
        if (!empty($person["away"])) return ["close" => false, "out" => $out];
        $out[] = ["who" => "others", "obj" => ["t" => "move", "id" => $person["id"], "x" => $pose["x"], "y" => $pose["y"], "z" => $pose["z"], "yaw" => $pose["yaw"]]];
        return ["close" => false, "out" => $out];
    }
    if ($msg["t"] === "say") {
        if (!empty($person["away"])) return ["close" => false, "out" => $out];
        if ($now - (int) $person["lastSay"] < 450) return ["close" => false, "out" => $out];
        $text = cleanText($msg["text"] ?? "");
        if ($text === "") return ["close" => false, "out" => $out];
        $person["lastSay"] = $now;
        $line = ["t" => "say", "id" => $person["id"], "name" => $person["name"], "text" => $text, "at" => $now];
        $log[] = $line;
        if (count($log) > LOG_MAX) array_shift($log);
        $out[] = ["who" => "all", "obj" => $line];
        return ["close" => false, "out" => $out];
    }
    if ($msg["t"] === "robot") {
        $ev = takeRobotPose($room, $person, $msg, $now);
        if ($ev) $out[] = $ev;
        return ["close" => false, "out" => $out];
    }
    if ($msg["t"] === "note") {
        $note = addNote($room, $person, $msg["text"] ?? "", $now);
        if ($note) $out[] = ["who" => "all", "obj" => $note];
        return ["close" => false, "out" => $out];
    }
    return ["close" => false, "out" => $out];
}
