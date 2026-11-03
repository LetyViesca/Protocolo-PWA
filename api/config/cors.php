<?php
 $origin = $_SERVER["HTTP_ORIGIN"] ?? "";
 $originHost = $origin !== "" ? parse_url($origin, PHP_URL_HOST) : null;
 $requestHost = $_SERVER["HTTP_HOST"] ?? "";
 $requestHost = strtolower(explode(":", $requestHost)[0]);
 $isLocalOrigin = in_array(strtolower((string)$originHost), ["localhost", "127.0.0.1"], true);
 $isSameHost = $originHost && strtolower((string)$originHost) === $requestHost;

if ($origin !== "" && ($isLocalOrigin || $isSameHost)) {
    header("Access-Control-Allow-Origin: " . $origin);
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
}
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
    http_response_code(200);
    exit();
}
?>