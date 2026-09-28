<?php
namespace Config;

use PDO;
use PDOException;

class Database {
    private static $host = "127.0.0.1:3307";
    private static $db = "emergencia_pwa_db";
    private static $user = "root";
    private static $pass = "";
    private static $instance = null;

    public static function getConnection() {
        if (self::$instance === null) {
            try {
                self::$instance = new PDO(
                    "mysql:host=" . self::$host . ";dbname=" . self::$db . ";charset=utf8mb4",
                    self::$user,
                    self::$pass,
                    [
                        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                        PDO::ATTR_EMULATE_PREPARES => false
                    ]
                );
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(["status" => "error", "mensaje" => "Error de conexión a BD: " . $e->getMessage()]);
                exit;
            }
        }
        return self::$instance;
    }
}
?>