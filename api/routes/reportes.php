<?php
require_once __DIR__ . "/../config/session.php";
require_once __DIR__ . "/../config/Database.php";

use Config\Database;

try {
    if (($_SERVER["REQUEST_METHOD"] ?? "GET") !== "GET") {
        respondJson(405, ["status" => "error", "mensaje" => "Método no permitido"]);
    }
    $connection = Database::getConnection();
    $user = requireAuthenticatedUser($connection);
    if (strtoupper(trim((string)$user["estatus_aprobado"])) !== "APROBADO" || empty($user["id_asociacion"])) {
        respondJson(403, ["status" => "forbidden", "mensaje" => "La cuenta no tiene acceso aprobado a reportes"]);
    }
    requireUserPermission($connection, $user, "reportes_ver");
    $connection->exec(
        "CREATE TABLE IF NOT EXISTS reporte_detalle_exportacion (
            id_reporte INT NOT NULL PRIMARY KEY,
            folio_servicio VARCHAR(20) NOT NULL,
            detalle_json LONGTEXT NOT NULL,
            fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_exportacion_folio (folio_servicio)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $connection->exec(
        "CREATE TABLE IF NOT EXISTS evidencias_reporte (
            id_evidencia BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_reporte INT NOT NULL,
            folio_servicio VARCHAR(20) NOT NULL,
            ruta_relativa VARCHAR(500) NOT NULL,
            fecha_subida TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_evidencias_reporte (id_reporte),
            INDEX idx_evidencias_folio (folio_servicio)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $statement = $connection->prepare(
        "SELECT r.id_reporte,
                COALESCE(NULLIF(l.folio_llamada, ''), CONCAT('REP-', r.id_reporte)) AS folio,
                DATE_FORMAT(r.fecha_hora_arribo, '%Y-%m-%d %H:%i') AS fecha,
                r.unidad_asignada AS unidad,
                COALESCE(GROUP_CONCAT(DISTINCT NULLIF(TRIM(CONCAT_WS(' ', p.nombre, p.apellido_paterno, p.apellido_materno)), '') SEPARATOR ', '), '') AS paciente,
                COALESCE(MAX(d.detalle_json), '{}') AS detalle_json,
                COALESCE(GROUP_CONCAT(DISTINCT e.ruta_relativa ORDER BY e.id_evidencia SEPARATOR '\n'), '') AS evidencias
         FROM reporte_atencion r
         INNER JOIN llamada_incidente l ON l.id_llamada = r.id_llamada
         LEFT JOIN paciente p ON p.id_reporte = r.id_reporte
         LEFT JOIN reporte_detalle_exportacion d ON d.id_reporte = r.id_reporte
         LEFT JOIN evidencias_reporte e ON e.id_reporte = r.id_reporte
         WHERE l.id_asociacion = :association_id
         GROUP BY r.id_reporte, l.folio_llamada, r.fecha_hora_arribo, r.unidad_asignada
         ORDER BY r.fecha_hora_arribo DESC"
    );
    $statement->execute([":association_id" => $user["id_asociacion"]]);
    $reports = array_map(static function (array $row): array {
        $details = json_decode((string)$row["detalle_json"], true);
        $evidencePaths = (string)$row["evidencias"];
        unset($row["detalle_json"]);
        unset($row["evidencias"]);
        $row["detalle"] = is_array($details) ? $details : [];
        $row["evidencias"] = $evidencePaths === "" ? [] : explode("\n", $evidencePaths);
        return $row;
    }, $statement->fetchAll());
    respondJson(200, ["status" => "success", "reportes" => $reports]);
} catch (Throwable $error) {
    error_log("Error en reportes.php: " . $error->getMessage());
    respondJson(500, ["status" => "error", "mensaje" => "No se pudieron consultar los reportes"]);
}
