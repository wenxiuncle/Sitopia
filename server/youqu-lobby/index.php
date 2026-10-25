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
if (!isset($data["videos"]) || !is_array($data["videos"])) $data["videos"] = blankVideos();
else $data["videos"] = normalizeVideos($data["videos"]);
if (!isset($data["notes"]) || !is_array($data["notes"])) $data["notes"] = [];
$now = (int) round(microtime(true) * 1000);
if (!isset($data["lift"]) || !is_array($data["lift"])) $data["lift"] = blankLift($now);
else $data["lift"] = normalizeLift($data["lift"], $now);
$ip = clientIp();
if (!rateOk($data, $ip, $now)) {
    saveState($statePath, $data);
    flock($lock, LOCK_UN);
    fclose($lock);
    respond(429, ["busy" => true]);
}

sweep($data, $now);
$liftNote = pumpLift($data, $now);
if ($liftNote) deliver($data, "", [["who" => "all", "obj" => $liftNote]]);
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
        stampVideos($result["out"], $data);
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

function blankVideos(): array {
    return ["urls" => []];
}

function normalizeVideos($saved): array {
    $videos = blankVideos();
    if (!is_array($saved)) return $videos;
    $urls = [];
    $raw = $saved["urls"] ?? [];
    if (is_array($raw)) {
        foreach ($raw as $line) {
            if (!is_string($line)) continue;
            $text = trim($line);
            if ($text === "" || strlen($text) > 400) continue;
            if (!preg_match('/^https?:\\/\\//i', $text)) continue;
            $urls[] = $text;
            if (count($urls) >= 20) break;
        }
    }
    $videos["urls"] = $urls;
    return $videos;
}

function stampVideos(array &$events, array &$data): void {
    if (!isset($data["videos"]) || !is_array($data["videos"])) $data["videos"] = blankVideos();
    else $data["videos"] = normalizeVideos($data["videos"]);
    $pack = ["urls" => $data["videos"]["urls"]];
    foreach ($events as &$ev) {
        if (!is_array($ev) || !isset($ev["obj"]) || !is_array($ev["obj"])) continue;
        if (($ev["obj"]["t"] ?? "") === "welcome") $ev["obj"]["videos"] = $pack;
    }
    unset($ev);
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
    $face = clearRobotFace($data, $id);
    if ($face) $out[] = ["who" => "all", "obj" => $face];
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

// 范围与 js/sign.js 的 readSignSpeed 相同。缺了或不合规则按 20，也就是原来的滚动速度。
function signSpeed($value): int {
    if (is_int($value) && $value >= 0 && $value <= 100) return $value;
    if (is_string($value) && preg_match('/^\d{1,3}$/', $value)) {
        $n = (int) $value;
        if ($n >= 0 && $n <= 100) return $n;
    }
    return 20;
}

function blankRobot(): array {
    return ["x" => 0.0, "z" => -2.9, "yaw" => M_PI, "driver" => "", "moving" => false, "poseAt" => 0, "speed" => 20];
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
    $robot["speed"] = signSpeed($saved["speed"] ?? null);
    return $robot;
}

function clearRobotFace(array &$data, string $id): ?array {
    if (!isset($data["robot"]) || !is_array($data["robot"])) return null;
    if ((string) ($data["robot"]["faceBy"] ?? "") !== $id) return null;
    $data["robot"]["faceBy"] = "";
    $data["robot"]["faceX"] = 0;
    $data["robot"]["faceZ"] = 0;
    return ["t" => "robot-face", "id" => $id, "off" => 1];
}

function takeRobotFace(array &$data, array &$person, array $msg, int $now): ?array {
    if (!empty($person["away"])) return null;
    if (!empty($msg["off"])) {
        $note = clearRobotFace($data, (string) ($person["id"] ?? ""));
        return $note ? ["who" => "others", "obj" => $note] : null;
    }
    $x = isset($msg["x"]) ? (float) $msg["x"] : NAN;
    $z = isset($msg["z"]) ? (float) $msg["z"] : NAN;
    if (!is_finite($x) || !is_finite($z)) return null;
    if ($x < -80 || $x > 80 || $z < -80 || $z > 80) return null;
    if ($now - (int) ($person["lastFace"] ?? 0) < 80) return null;
    $rx = round($x, 2);
    $rz = round($z, 2);
    $robot = &$data["robot"];
    if ((string) ($robot["faceBy"] ?? "") === (string) ($person["id"] ?? "") && (float) ($robot["faceX"] ?? 0) === $rx && (float) ($robot["faceZ"] ?? 0) === $rz) {
        return null;
    }
    $person["lastFace"] = $now;
    $robot["faceBy"] = (string) ($person["id"] ?? "");
    $robot["faceX"] = $rx;
    $robot["faceZ"] = $rz;
    return ["who" => "others", "obj" => ["t" => "robot-face", "id" => $person["id"], "x" => $rx, "z" => $rz]];
}

function robotView(array $robot): array {
    return [
        "t" => "robot",
        "x" => $robot["x"],
        "z" => $robot["z"],
        "yaw" => $robot["yaw"],
        "driver" => (string) ($robot["driver"] ?? ""),
        "moving" => !empty($robot["moving"]),
        "speed" => signSpeed($robot["speed"] ?? null),
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

function addNote(array &$data, array &$person, $text, int $now, $parent = ""): ?array {
    if (!empty($person["away"])) return null;
    if ($now - (int) ($person["lastNote"] ?? 0) < 2500) return null;
    $clean = cleanNoteText($text);
    if ($clean === "") return null;
    $person["lastNote"] = $now;
    $parentId = uSlice(trim((string) $parent), 48);
    $found = false;
    if ($parentId !== "") {
        foreach ($data["notes"] as $row) {
            if (is_array($row) && (string) ($row["id"] ?? "") === $parentId) {
                $found = true;
                break;
            }
        }
    }
    if (!$found) $parentId = "";
    $note = [
        "id" => (string) $person["id"] . "-" . $now,
        "name" => (string) ($person["name"] ?? "访客"),
        "text" => $clean,
        "at" => $now,
    ];
    if ($parentId !== "") $note["parent"] = $parentId;
    $data["notes"][] = $note;
    if (count($data["notes"]) > 200) $data["notes"] = array_slice($data["notes"], -200);
    $out = ["t" => "note", "id" => $note["id"], "name" => $note["name"], "text" => $note["text"], "at" => $note["at"]];
    if ($parentId !== "") $out["parent"] = $parentId;
    return $out;
}

function attachDesk(array &$events, array $data): void {
    foreach ($events as &$ev) {
        if (!isset($ev["obj"]) || !is_array($ev["obj"])) continue;
        if (($ev["obj"]["t"] ?? "") !== "welcome") continue;
        $ev["obj"]["robot"] = robotView($data["robot"]);
        $ev["obj"]["notes"] = array_values($data["notes"]);
        if (isset($data["lift"]) && is_array($data["lift"])) $ev["obj"]["lift"] = liftView($data["lift"]);
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
            if (($ev["obj"]["t"] ?? "") === "lift") {
                $replaced = false;
                foreach ($data["queues"][$pid] as $qi => $queued) {
                    if (is_array($queued) && ($queued["t"] ?? "") === "lift") {
                        $data["queues"][$pid][$qi] = $ev["obj"];
                        $replaced = true;
                        break;
                    }
                }
                if (!$replaced) $data["queues"][$pid][] = $ev["obj"];
                continue;
            }
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
    if ($msg["t"] === "robot-face") {
        $ev = isset($room["robot"]) ? takeRobotFace($room, $person, $msg, $now) : null;
        if ($ev) $out[] = $ev;
        return ["close" => false, "out" => $out];
    }
    if ($msg["t"] === "note") {
        $note = addNote($room, $person, $msg["text"] ?? "", $now, $msg["parent"] ?? "");
        if ($note) $out[] = ["who" => "all", "obj" => $note];
        return ["close" => false, "out" => $out];
    }
    if ($msg["t"] === "lift-call") {
        $view = takeLiftCall($room, $person, $msg, $now);
        if ($view) $out[] = ["who" => "all", "obj" => $view];
        return ["close" => false, "out" => $out];
    }
    return ["close" => false, "out" => $out];
}

const LIFT_STORY = 5.4;
const LIFT_FLOORS = 64;
// 与 js/lift.js 的 CRUISE、ACCEL 相同。
const LIFT_CRUISE = 2.53125;
const LIFT_ACCEL = 2.15625;
const LIFT_DOOR_SPEED = 0.833333333333;
const LIFT_DWELL = 3.1;
const LIFT_X_REAR = -18.4;
const LIFT_X_DOOR = -15.5;
const LIFT_Z0 = -4.75;
const LIFT_Z1 = -0.25;
const LIFT_CZ = -3.0;
const LIFT_DOOR_W = 1.8;

function blankLift(int $now): array {
    return [
        "y" => 0.0,
        "door" => 0.0,
        "vel" => 0.0,
        "phase" => "idle",
        "dir" => 0,
        "current" => 0,
        "dest" => 0,
        "stops" => [],
        "dwell" => 0.0,
        "at" => $now,
        "key" => "",
        "sentAt" => 0,
    ];
}

function normalizeLift(array $saved, int $now): array {
    $lift = blankLift($now);
    $phase = (string) ($saved["phase"] ?? "idle");
    if (in_array($phase, ["idle", "opening", "open", "closing", "moving"], true)) $lift["phase"] = $phase;
    $lift["y"] = (float) ($saved["y"] ?? 0);
    $lift["door"] = max(0.0, min(1.0, (float) ($saved["door"] ?? 0)));
    $lift["vel"] = (float) ($saved["vel"] ?? 0);
    $dir = (int) ($saved["dir"] ?? 0);
    $lift["dir"] = $dir > 0 ? 1 : ($dir < 0 ? -1 : 0);
    $cur = (int) ($saved["current"] ?? 0);
    $dst = (int) ($saved["dest"] ?? 0);
    $lift["current"] = max(0, min(LIFT_FLOORS - 1, $cur));
    $lift["dest"] = max(0, min(LIFT_FLOORS - 1, $dst));
    $lift["dwell"] = (float) ($saved["dwell"] ?? 0);
    $stops = [];
    foreach (($saved["stops"] ?? []) as $floor) {
        $n = (int) $floor;
        if ($n >= 0 && $n < LIFT_FLOORS) $stops[$n] = $n;
    }
    $lift["stops"] = array_values($stops);
    $stamp = (int) ($saved["at"] ?? 0);
    if ($stamp > 0 && $now - $stamp <= 120000) $lift["at"] = $stamp;
    else {
        $floor = (int) round($lift["y"] / LIFT_STORY);
        $lift = blankLift($now);
        $floor = max(0, min(LIFT_FLOORS - 1, $floor));
        $lift["y"] = $floor * LIFT_STORY;
        $lift["current"] = $floor;
        $lift["dest"] = $floor;
    }
    return $lift;
}

function liftStopList(array $lift): array {
    $out = [];
    foreach ($lift["stops"] as $floor) $out[] = (int) $floor;
    sort($out);
    return $out;
}

function liftHas(array $lift, int $floor): bool {
    foreach ($lift["stops"] as $stop) if ((int) $stop === $floor) return true;
    return false;
}

function liftAdd(array &$lift, int $floor): void {
    if (!liftHas($lift, $floor)) $lift["stops"][] = $floor;
}

function liftDrop(array &$lift, int $floor): void {
    $next = [];
    foreach ($lift["stops"] as $stop) if ((int) $stop !== $floor) $next[] = (int) $stop;
    $lift["stops"] = $next;
}

function liftView(array $lift): array {
    return [
        "t" => "lift",
        "y" => round((float) $lift["y"], 3),
        "door" => round((float) $lift["door"], 3),
        "vel" => round((float) $lift["vel"], 3),
        "phase" => (string) $lift["phase"],
        "dir" => (int) $lift["dir"],
        "current" => (int) $lift["current"],
        "dest" => (int) $lift["dest"],
        "stops" => liftStopList($lift),
        "at" => (int) $lift["at"],
    ];
}

function liftKey(array $view): string {
    return $view["phase"] . "|" . $view["dir"] . "|" . $view["current"] . "|" . $view["dest"] . "|" . $view["y"] . "|" . $view["door"] . "|" . implode(",", $view["stops"]);
}

function phpInLiftCar(float $x, float $z): bool {
    return $x > LIFT_X_REAR + 0.16 && $x < LIFT_X_DOOR - 0.12 && $z > LIFT_Z0 + 0.1 && $z < LIFT_Z1 - 0.1;
}

function phpBlocksLift(float $x, float $z, float $y, float $cabY): bool {
    if (abs($y - $cabY) > 0.9) return false;
    if (phpInLiftCar($x, $z)) return false;
    if (abs($z - LIFT_CZ) > LIFT_DOOR_W / 2 + 0.45) return false;
    return $x > LIFT_X_DOOR - 0.55 && $x < LIFT_X_DOOR + 1.5;
}

function liftBlocked(array $people, float $cabY): bool {
    foreach ($people as $person) {
        if (!is_array($person) || empty($person["named"]) || !empty($person["away"]) || !empty($person["gone"])) continue;
        $x = (float) ($person["x"] ?? 0);
        $z = (float) ($person["z"] ?? 0);
        $y = (float) ($person["y"] ?? 0);
        if (phpBlocksLift($x, $z, $y, $cabY)) return true;
    }
    return false;
}

function liftArrive(array &$lift, int $floor): void {
    $lift["current"] = $floor;
    $lift["y"] = $floor * LIFT_STORY;
    $lift["vel"] = 0.0;
    liftDrop($lift, $floor);
    $lift["dest"] = $floor;
    $lift["phase"] = "opening";
}

function liftNext(array &$lift): ?int {
    if (!$lift["stops"]) return null;
    $ups = [];
    $downs = [];
    $here = null;
    $y = (float) $lift["y"];
    foreach ($lift["stops"] as $floor) {
        $floor = (int) $floor;
        $delta = $floor * LIFT_STORY - $y;
        if (abs($delta) <= 0.08) $here = $floor;
        elseif ($delta > 0) $ups[] = $floor;
        else $downs[] = $floor;
    }
    sort($ups);
    rsort($downs);
    if ($here !== null) return $here;
    $dir = (int) $lift["dir"];
    if ($dir > 0 && $ups) return $ups[0];
    if ($dir < 0 && $downs) return $downs[0];
    if ($dir === 0) {
        if ($ups) {
            $lift["dir"] = 1;
            return $ups[0];
        }
        if ($downs) {
            $lift["dir"] = -1;
            return $downs[0];
        }
        return null;
    }
    if ($dir > 0 && $downs) {
        $lift["dir"] = -1;
        return $downs[0];
    }
    if ($dir < 0 && $ups) {
        $lift["dir"] = 1;
        return $ups[0];
    }
    $lift["dir"] = 0;
    return null;
}

function liftGlide(array &$lift, float $dt, bool $finish): void {
    $dest = (int) $lift["dest"];
    $goal = $dest * LIFT_STORY;
    $dist = $goal - (float) $lift["y"];
    $adist = abs($dist);
    if ($adist < 0.03 || ($dest === (int) $lift["current"] && $adist < 0.02)) {
        if ($finish) liftArrive($lift, $dest);
        return;
    }
    $sign = $dist < 0 ? -1.0 : 1.0;
    $vel = (float) $lift["vel"];
    $brake = ($vel * $vel) / (2 * LIFT_ACCEL + 1e-6);
    if ($adist <= $brake) $vel -= $sign * LIFT_ACCEL * $dt;
    else $vel += $sign * LIFT_ACCEL * $dt;
    $cap = min(LIFT_CRUISE, sqrt(2 * LIFT_ACCEL * $adist));
    if ($vel > $cap) $vel = $cap;
    if ($vel < -$cap) $vel = -$cap;
    if ($vel * $sign < 0) $vel = 0.0;
    $step = $vel * $dt;
    $lift["vel"] = $vel;
    if (abs($step) >= $adist - 1e-4 || $vel == 0.0) {
        if ($finish) liftArrive($lift, $dest);
        return;
    }
    $lift["y"] = (float) $lift["y"] + $step;
}

function liftTick(array &$lift, float $dt, bool $blocked): void {
    $phase = (string) $lift["phase"];
    if ($phase === "opening") {
        $lift["door"] = (float) $lift["door"] + $dt * LIFT_DOOR_SPEED;
        if ($lift["door"] >= 1) {
            $lift["door"] = 1.0;
            $lift["phase"] = "open";
            $lift["dwell"] = LIFT_DWELL;
        }
        return;
    }
    if ($phase === "open") {
        if ($blocked) {
            $lift["dwell"] = LIFT_DWELL;
            return;
        }
        $lift["dwell"] = (float) $lift["dwell"] - $dt;
        if ($lift["dwell"] <= 0) $lift["phase"] = "closing";
        return;
    }
    if ($phase === "closing") {
        if ($blocked) {
            $lift["phase"] = "opening";
            return;
        }
        $lift["door"] = (float) $lift["door"] - $dt * LIFT_DOOR_SPEED;
        if ($lift["door"] <= 0) {
            $lift["door"] = 0.0;
            liftDrop($lift, (int) $lift["current"]);
            if ($lift["stops"]) $lift["phase"] = "moving";
            else {
                $lift["phase"] = "idle";
                $lift["dir"] = 0;
            }
        }
        return;
    }
    if ($phase === "idle") {
        if ($lift["stops"]) $lift["phase"] = "moving";
        return;
    }
    $target = liftNext($lift);
    if ($target === null) {
        $level = (float) $lift["y"] / LIFT_STORY;
        $dir = (int) $lift["dir"];
        $vel = (float) $lift["vel"];
        $goingUp = $dir > 0 || $vel > 0.02;
        $goingDown = !$goingUp && ($dir < 0 || $vel < -0.02);
        if (!$goingUp && !$goingDown) {
            $lift["y"] = (int) $lift["current"] * LIFT_STORY;
            $lift["vel"] = 0.0;
            $lift["dir"] = 0;
            $lift["dest"] = (int) $lift["current"];
            $lift["phase"] = "idle";
            return;
        }
        $ahead = $goingUp
            ? min(LIFT_FLOORS - 1, (int) ceil($level - 1e-4))
            : max(0, (int) floor($level + 1e-4));
        $progressed = $goingUp ? $level - (int) $lift["current"] : (int) $lift["current"] - $level;
        if ($ahead === (int) $lift["current"] || $progressed < 0.12) {
            $lift["y"] = (int) $lift["current"] * LIFT_STORY;
            $lift["vel"] = 0.0;
            $lift["dir"] = 0;
            $lift["dest"] = (int) $lift["current"];
            $lift["phase"] = "opening";
            return;
        }
        $target = $ahead;
    }
    $lift["dest"] = $target;
    liftGlide($lift, $dt, true);
}

function liftCall(array &$lift, int $floor): void {
    if ($floor === (int) $lift["current"] && $lift["phase"] !== "moving") {
        if ($lift["phase"] === "closing" || $lift["phase"] === "idle") $lift["phase"] = "opening";
        if ($lift["phase"] === "open") $lift["dwell"] = max((float) $lift["dwell"], LIFT_DWELL);
        return;
    }
    liftAdd($lift, $floor);
    if ($lift["phase"] === "open" || $lift["phase"] === "opening") $lift["phase"] = "closing";
    elseif ($lift["phase"] === "idle") $lift["phase"] = "moving";
}

function liftRoomEmpty(array $people): bool {
    foreach ($people as $person) {
        if (!is_array($person)) continue;
        if (!empty($person["named"]) && empty($person["gone"])) return false;
    }
    return true;
}

// 房间没有还连着的人时，丢掉其它停靠，轿厢回一楼。人还在就不改他们的呼叫。切到别的页面不算离开。
function parkEmptyLift(array &$lift, array $people): void {
    if (!liftRoomEmpty($people)) return;
    foreach (liftStopList($lift) as $floor) {
        if ($floor !== 0) liftDrop($lift, $floor);
    }
    if ((int) $lift["current"] === 0 && abs((float) $lift["y"]) < 0.05 && $lift["phase"] !== "moving") return;
    if (!liftHas($lift, 0)) liftCall($lift, 0);
}

function advanceLift(array &$data, int $now): void {
    if (!isset($data["lift"]) || !is_array($data["lift"])) $data["lift"] = blankLift($now);
    $lift = &$data["lift"];
    $gap = ($now - (int) ($lift["at"] ?? $now)) / 1000;
    if ($gap < 0) $gap = 0;
    if ($gap > 70) $gap = 70;
    $lift["at"] = $now;
    $left = $gap;
    $steps = 0;
    $people = isset($data["people"]) && is_array($data["people"]) ? $data["people"] : [];
    parkEmptyLift($lift, $people);
    while ($left > 0.0001 && $steps < 2200) {
        if ($lift["phase"] === "idle" && (float) $lift["door"] <= 0.001 && !$lift["stops"]) break;
        $step = min($left, 1 / 30);
        liftTick($lift, $step, liftBlocked($people, (float) $lift["y"]));
        $left -= 1 / 30;
        $steps += 1;
    }
}

function pumpLift(array &$data, int $now): ?array {
    advanceLift($data, $now);
    $view = liftView($data["lift"]);
    $key = liftKey($view);
    $phaseChanged = $view["phase"] !== (string) ($data["lift"]["phaseKey"] ?? "");
    $prev = (string) ($data["lift"]["key"] ?? "");
    $stopsChanged = substr($key, (int) strrpos($key, "|")) !== ($prev === "" ? "" : substr($prev, (int) strrpos($prev, "|")));
    if ($key === $prev) return null;
    if (!$phaseChanged && !$stopsChanged && $now - (int) ($data["lift"]["sentAt"] ?? 0) < 80) return null;
    $data["lift"]["key"] = $key;
    $data["lift"]["phaseKey"] = $view["phase"];
    $data["lift"]["sentAt"] = $now;
    return $view;
}

function takeLiftCall(array &$room, array &$person, array $msg, int $now): ?array {
    if (!empty($person["away"])) return null;
    if ($now - (int) ($person["lastLift"] ?? 0) < 50) return null;
    $floor = (int) floor((float) ($msg["floor"] ?? -1));
    if ($floor < 0 || $floor >= LIFT_FLOORS) return null;
    $person["lastLift"] = $now;
    if (!isset($room["lift"]) || !is_array($room["lift"])) $room["lift"] = blankLift($now);
    advanceLift($room, $now);
    if (($msg["on"] ?? 1) === 0 || ($msg["on"] ?? 1) === false) liftDrop($room["lift"], $floor);
    else liftCall($room["lift"], $floor);
    $view = liftView($room["lift"]);
    $room["lift"]["key"] = liftKey($view);
    $room["lift"]["phaseKey"] = $view["phase"];
    $room["lift"]["sentAt"] = $now;
    return $view;
}
