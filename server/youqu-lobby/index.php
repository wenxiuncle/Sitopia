<?php
// 有趣网址之家上已经挂着的房间。GitHub 预览页不连这里。
// 规则和 tools/room.mjs 对齐。改房间行为时两处一起改。这次不传到主机。
declare(strict_types=1);

const MAX_PEOPLE = 24;
const LOG_MAX = 40;
const STALE_MS = 90000;

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
$now = (int) round(microtime(true) * 1000);
$ip = clientIp();
if (!rateOk($data, $ip, $now)) {
    saveState($statePath, $data);
    flock($lock, LOCK_UN);
    fclose($lock);
    respond(429, ["busy" => true]);
}

sweep($data, $now);

$created = false;
if ($wantId === "" || !isset($data["people"][$wantId])) {
    $wantId = newId($data["people"]);
    $data["people"][$wantId] = blankPerson($wantId, $now);
    $data["queues"][$wantId] = [];
    $created = true;
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
    $result = onClientMessage($data["people"], $data["log"], $data["people"][$id], $msg, $now);
    deliver($data, $id, $result["out"]);
    if ($result["close"]) {
        if (isset($data["people"][$id])) deliver($data, $id, onLeave($data, $id));
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
        "seen" => $now,
        "lastMove" => 0,
        "lastSay" => 0,
        "lastName" => 0,
        "gone" => false,
    ];
}

function uSlice(string $text, int $n): string {
    if (function_exists("mb_substr")) return mb_substr($text, 0, $n, "UTF-8");
    return substr($text, 0, $n);
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

function namedCount(array $people): int {
    $n = 0;
    foreach ($people as $person) {
        if (!empty($person["named"]) && empty($person["away"]) && empty($person["gone"])) $n++;
    }
    return $n;
}

function snapshot(array $people, string $exceptId): array {
    $list = [];
    foreach ($people as $person) {
        if (($person["id"] ?? "") === $exceptId || empty($person["named"]) || !empty($person["away"]) || !empty($person["gone"])) continue;
        $list[] = [
            "id" => $person["id"],
            "name" => $person["name"],
            "x" => $person["x"],
            "y" => $person["y"] ?? 0,
            "z" => $person["z"],
            "yaw" => $person["yaw"],
        ];
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
    if (!$announce) return [];
    return [[
        "who" => "all",
        "obj" => ["t" => "bye", "id" => $id, "name" => $name, "n" => namedCount($data["people"])],
    ]];
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

function onClientMessage(array &$people, array &$log, array &$person, array $msg, int $now): array {
    $out = [];
    $person["seen"] = $now;
    if ($msg["t"] === "hi" && empty($person["named"])) {
        if (namedCount($people) >= MAX_PEOPLE) {
            return ["close" => true, "out" => [["who" => "self", "obj" => ["t" => "full"]]]];
        }
        $person["name"] = uniqueName($people, cleanName($msg["name"] ?? ""), (string) $person["id"]);
        $person["named"] = true;
        $person["away"] = ($msg["away"] ?? false) === true;
        $n = namedCount($people);
        $out[] = [
            "who" => "self",
            "obj" => [
                "t" => "welcome",
                "id" => $person["id"],
                "name" => $person["name"],
                "away" => $person["away"],
                "n" => $n,
                "people" => snapshot($people, (string) $person["id"]),
                "log" => array_values($log),
            ],
        ];
        if (empty($person["away"])) {
            $out[] = [
                "who" => "others",
                "obj" => [
                    "t" => "join",
                    "id" => $person["id"],
                    "name" => $person["name"],
                    "x" => $person["x"],
                    "y" => $person["y"] ?? 0,
                    "z" => $person["z"],
                    "yaw" => $person["yaw"],
                    "n" => $n,
                ],
            ];
        }
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
        $out[] = [
            "who" => "others",
            "obj" => [
                "t" => "join",
                "id" => $person["id"],
                "name" => $person["name"],
                "x" => $person["x"],
                "y" => $person["y"] ?? 0,
                "z" => $person["z"],
                "yaw" => $person["yaw"],
                "n" => namedCount($people),
            ],
        ];
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
    }
    return ["close" => false, "out" => $out];
}
