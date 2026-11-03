<?php
namespace Models;

use Config\Database;
use DateTime;
use InvalidArgumentException;
use PDO;
use RuntimeException;

class ReporteCampo {
    private PDO $conn;

    public function __construct() {
        $this->conn = Database::getConnection();
    }

    public function guardarReporte(array $data, array $user, array $evidenceUpload = []): array {
        $general = $data["general"] ?? null;
        $patients = $data["pacientes"] ?? null;
        $supplies = $data["insumos"] ?? [];
        if (!is_array($general) || !is_array($patients) || count($patients) === 0 || !is_array($supplies)) {
            throw new InvalidArgumentException("El reporte requiere datos generales y al menos un paciente.");
        }
        $associationId = (int)($user["id_asociacion"] ?? 0);
        $userId = (int)$user["id_usuario"];
        if ($associationId < 1 || $userId < 1) {
            throw new InvalidArgumentException("La cuenta no tiene asociación aprobada.");
        }
        if ($supplies
            && !\userCanAccess($this->conn, $user, "almacen_modificar")
            && !\userCanAccess($this->conn, $user, "campo_ver")
            && !\userCanAccess($this->conn, $user, "campo_modificar")) {
            throw new InvalidArgumentException("No tienes permiso para descontar insumos del almacén.");
        }

        $unitName = trim((string)($general["unidad"] ?? ""));
        $location = trim((string)($general["direccion"] ?? ""));
        if ($unitName === "" || $location === "") {
            throw new InvalidArgumentException("Unidad y ubicación del incidente son obligatorias.");
        }
        $folio = trim((string)($general["folio"] ?? ""));
        if ($folio === "") {
            $folio = "REP-" . date("Ymd-His");
        }
        $arrival = DateTime::createFromFormat(
            "Y-m-d H:i",
            trim((string)($general["fecha"] ?? "")) . " " . trim((string)($general["horaLlegada"] ?? ""))
        );
        $arrivalAt = $arrival ? $arrival->format("Y-m-d H:i:s") : date("Y-m-d H:i:s");
        $incidentType = trim((string)($general["tipoIncidente"] ?? "Atención prehospitalaria"));
        $storedFolio = mb_substr($folio, 0, 20);
        $evidenceFiles = $this->normalizeEvidenceFiles($evidenceUpload);
        $evidenceDirectory = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . "uploads" . DIRECTORY_SEPARATOR . "evidencias";
        if ($evidenceFiles) {
            if (!is_dir($evidenceDirectory) && !mkdir($evidenceDirectory, 0775, true) && !is_dir($evidenceDirectory)) {
                throw new RuntimeException("No se pudo crear la carpeta de evidencias del servidor.");
            }
            $this->conn->exec(
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
        }
        $this->conn->exec(
            "CREATE TABLE IF NOT EXISTS reporte_detalle_exportacion (
                id_reporte INT NOT NULL PRIMARY KEY,
                folio_servicio VARCHAR(20) NOT NULL,
                detalle_json LONGTEXT NOT NULL,
                fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_exportacion_folio (folio_servicio)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        $uploadedEvidencePaths = [];
        $storedEvidencePaths = [];
        $storedSupplyDetails = [];
        $this->conn->beginTransaction();
        try {
            $call = $this->conn->prepare(
                "INSERT INTO llamada_incidente
                    (id_asociacion, id_usuario_cabina, folio_llamada, ubicacion_incidente, tipo_incidente)
                 VALUES (:association_id, :user_id, :folio, :location, :incident_type)"
            );
            $call->execute([
                ":association_id" => $associationId,
                ":user_id" => $userId,
                ":folio" => $storedFolio,
                ":location" => mb_substr($location, 0, 200),
                ":incident_type" => mb_substr($incidentType, 0, 100),
            ]);
            $callId = (int)$this->conn->lastInsertId();

            $report = $this->conn->prepare(
                "INSERT INTO reporte_atencion
                    (id_llamada, id_usuario_responsable, fecha_hora_arribo, fecha_hora_termino,
                     num_pacientes, tipo_accidente, unidad_asignada, direccion_accidente, estado_sincronizacion)
                 VALUES (:call_id, :user_id, :arrival, NOW(), :patient_count, :incident_type, :unit, :location, 'SINCRONIZADO')"
            );
            $report->execute([
                ":call_id" => $callId,
                ":user_id" => $userId,
                ":arrival" => $arrivalAt,
                ":patient_count" => count($patients),
                ":incident_type" => mb_substr($incidentType, 0, 100),
                ":unit" => mb_substr($unitName, 0, 50),
                ":location" => mb_substr($location, 0, 200),
            ]);
            $reportId = (int)$this->conn->lastInsertId();

            $patientInsert = $this->conn->prepare(
                "INSERT INTO paciente
                    (id_reporte, id_usuario_registro, nombre, edad, sexo, domicilio, antecedentes_medicos,
                     queja_principal, estado_consciencia_general, comentarios_observaciones)
                 VALUES (:report_id, :user_id, :name, :age, :sex, :address, :history, :complaint, :consciousness, :comments)"
            );
            $patientIds = [];
            foreach ($patients as $patient) {
                if (!is_array($patient)) {
                    throw new InvalidArgumentException("El reporte contiene datos de paciente inválidos.");
                }
                $age = filter_var($patient["edad"] ?? null, FILTER_VALIDATE_INT);
                $patientInsert->execute([
                    ":report_id" => $reportId,
                    ":user_id" => $userId,
                    ":name" => mb_substr(trim((string)($patient["nombre"] ?? "")), 0, 50) ?: null,
                    ":age" => $age === false ? null : $age,
                    ":sex" => mb_substr(trim((string)($patient["sexo"] ?? "")), 0, 20) ?: null,
                    ":address" => mb_substr($location, 0, 200),
                    ":history" => trim((string)($patient["alergias"] ?? "")) ?: null,
                    ":complaint" => mb_substr($incidentType, 0, 100),
                    ":consciousness" => mb_substr(trim((string)($patient["triage"] ?? "")), 0, 50) ?: null,
                    ":comments" => trim((string)($patient["observaciones"] ?? "")) ?: null,
                ]);
                $patientIds[] = (int)$this->conn->lastInsertId();
            }

            if ($supplies) {
                $unitQuery = $this->conn->prepare(
                    "SELECT id_unidades FROM unidades
                     WHERE id_asociacion = :association_id AND nombre_unidad = :unit_name
                     LIMIT 1"
                );
                $unitQuery->execute([":association_id" => $associationId, ":unit_name" => $unitName]);
                $unitId = $unitQuery->fetchColumn();
                if (!$unitId) {
                    throw new InvalidArgumentException("La unidad indicada no está registrada en esta asociación.");
                }

                $stockQuery = $this->conn->prepare(
                    "SELECT iu.id_ubicacion_stock, iu.cantidad_disponible
                     FROM inventario_ubicacion iu
                     WHERE iu.id_insumo = :item_id
                       AND iu.id_referencia_lugar = :unit_id
                       AND UPPER(iu.tipo_ubicacion) IN ('UNIDAD', 'AMBULANCIA', 'BOTIQUIN')
                     ORDER BY iu.id_ubicacion_stock
                     FOR UPDATE"
                );
                $stockUpdate = $this->conn->prepare(
                    "UPDATE inventario_ubicacion
                     SET cantidad_disponible = cantidad_disponible - :quantity
                     WHERE id_ubicacion_stock = :stock_id AND cantidad_disponible >= :minimum"
                );
                $detailInsert = $this->conn->prepare(
                    "INSERT INTO detalle_insumos_reporte (id_reporte, id_paciente, id_insumo, cantidad_usada)
                     VALUES (:report_id, :patient_id, :item_id, :quantity)"
                );
                foreach ($supplies as $supply) {
                    if (!is_array($supply)) {
                        throw new InvalidArgumentException("La lista de insumos contiene datos inválidos.");
                    }
                    $itemId = filter_var($supply["id_insumo"] ?? null, FILTER_VALIDATE_INT);
                    $quantity = filter_var($supply["cantidad_usada"] ?? null, FILTER_VALIDATE_INT);
                    if ($itemId === false || $itemId < 1 || $quantity === false || $quantity < 1) {
                        throw new InvalidArgumentException("Cada insumo debe tener un ID y una cantidad válida.");
                    }
                    $stockQuery->execute([":item_id" => $itemId, ":unit_id" => $unitId]);
                    $stockRows = $stockQuery->fetchAll();
                    $available = array_sum(array_map(static fn(array $row): int => (int)$row["cantidad_disponible"], $stockRows));
                    if ($available < $quantity) {
                        throw new RuntimeException("Stock insuficiente para el insumo seleccionado.");
                    }
                    $remaining = $quantity;
                    foreach ($stockRows as $stockRow) {
                        if ($remaining === 0) break;
                        $deduction = min($remaining, (int)$stockRow["cantidad_disponible"]);
                        if ($deduction === 0) continue;
                        $stockUpdate->execute([
                            ":quantity" => $deduction,
                            ":stock_id" => $stockRow["id_ubicacion_stock"],
                            ":minimum" => $deduction,
                        ]);
                        if ($stockUpdate->rowCount() !== 1) {
                            throw new RuntimeException("El inventario cambió y no fue posible descontar el stock.");
                        }
                        $remaining -= $deduction;
                    }
                    $detailInsert->execute([
                        ":report_id" => $reportId,
                        ":patient_id" => $patientIds[0],
                        ":item_id" => $itemId,
                        ":quantity" => $quantity,
                    ]);
                    $itemDetails = $this->conn->prepare(
                        "SELECT nombre, unidad_medida FROM insumos WHERE id_insumo = :item_id LIMIT 1"
                    );
                    $itemDetails->execute([":item_id" => $itemId]);
                    $item = $itemDetails->fetch();
                    $storedSupplyDetails[] = [
                        "id_insumo" => $itemId,
                        "nombre" => $item["nombre"] ?? "Insumo " . $itemId,
                        "cantidad_usada" => $quantity,
                        "unidad_medida" => $item["unidad_medida"] ?? "",
                    ];
                }
            }

            $exportData = $data;
            $exportData["insumos"] = $storedSupplyDetails;
            $exportData["hora_despacho"] = (string)($general["horaLlamada"] ?? "");
            $exportData["hora_arribo"] = (string)($general["horaLlegada"] ?? "");
            $exportData["ubicacion"] = $location;
            $exportData["triage"] = array_values(array_unique(array_filter(array_map(
                static fn(array $patient): string => trim((string)($patient["triage"] ?? "")),
                array_filter($patients, "is_array")
            ))));
            $exportData["personal"] = [
                "paramedico" => (string)($general["paramedicoCargo"] ?? ""),
                "operador" => (string)($general["operador"] ?? ""),
                "apoyo" => (string)($general["elementosApoyo"] ?? ""),
            ];
            $detailInsert = $this->conn->prepare(
                "INSERT INTO reporte_detalle_exportacion (id_reporte, folio_servicio, detalle_json)
                 VALUES (:report_id, :folio, :detail)"
            );
            $detailInsert->execute([
                ":report_id" => $reportId,
                ":folio" => $storedFolio,
                ":detail" => json_encode($exportData, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
            ]);

            $evidenceInsert = $evidenceFiles
                ? $this->conn->prepare(
                    "INSERT INTO evidencias_reporte (id_reporte, folio_servicio, ruta_relativa)
                     VALUES (:report_id, :folio, :path)"
                )
                : null;
            $safeFolio = preg_replace('/[^A-Za-z0-9_-]/', '_', $storedFolio) ?: "reporte";
            foreach ($evidenceFiles as $evidenceFile) {
                $fileName = $safeFolio . "_" . bin2hex(random_bytes(12)) . "." . $evidenceFile["extension"];
                $absolutePath = $evidenceDirectory . DIRECTORY_SEPARATOR . $fileName;
                $relativePath = "uploads/evidencias/" . $fileName;
                if (!move_uploaded_file($evidenceFile["temporary_path"], $absolutePath)) {
                    throw new RuntimeException("No se pudo guardar una fotografía de evidencia.");
                }
                $uploadedEvidencePaths[] = $absolutePath;
                $storedEvidencePaths[] = $relativePath;
                $evidenceInsert->execute([
                    ":report_id" => $reportId,
                    ":folio" => $storedFolio,
                    ":path" => $relativePath,
                ]);
            }

            $this->conn->commit();
            return [
                "status" => "success",
                "mensaje" => "Reporte registrado correctamente",
                "id_reporte" => $reportId,
                "folio" => $folio,
                "evidencias" => $storedEvidencePaths,
            ];
        } catch (\Throwable $error) {
            if ($this->conn->inTransaction()) $this->conn->rollBack();
            foreach ($uploadedEvidencePaths as $uploadedPath) {
                if (is_file($uploadedPath)) unlink($uploadedPath);
            }
            throw $error;
        }
    }

    private function normalizeEvidenceFiles(array $upload): array {
        if (!isset($upload["name"])) return [];
        $names = is_array($upload["name"]) ? $upload["name"] : [$upload["name"]];
        $temporaryPaths = is_array($upload["tmp_name"] ?? null) ? $upload["tmp_name"] : [$upload["tmp_name"] ?? ""];
        $errors = is_array($upload["error"] ?? null) ? $upload["error"] : [$upload["error"] ?? UPLOAD_ERR_NO_FILE];
        $sizes = is_array($upload["size"] ?? null) ? $upload["size"] : [$upload["size"] ?? 0];
        if (count($names) > 10) {
            throw new InvalidArgumentException("Solo se permiten hasta 10 fotografías por reporte.");
        }
        $allowedTypes = [
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            "image/heic" => "heic",
            "image/heif" => "heif",
            "image/avif" => "avif",
        ];
        $fileInfo = new \finfo(FILEINFO_MIME_TYPE);
        $normalized = [];
        foreach ($names as $index => $_name) {
            $error = (int)($errors[$index] ?? UPLOAD_ERR_NO_FILE);
            if ($error === UPLOAD_ERR_NO_FILE) continue;
            if ($error !== UPLOAD_ERR_OK) {
                throw new InvalidArgumentException("No se pudo recibir una fotografía de evidencia.");
            }
            $temporaryPath = (string)($temporaryPaths[$index] ?? "");
            if (!is_uploaded_file($temporaryPath) || (int)($sizes[$index] ?? 0) > 10 * 1024 * 1024) {
                throw new InvalidArgumentException("Una fotografía es inválida o supera el límite de 10 MB.");
            }
            $mimeType = $fileInfo->file($temporaryPath);
            if (!isset($allowedTypes[$mimeType])) {
                throw new InvalidArgumentException("Las evidencias deben ser archivos de imagen válidos.");
            }
            $normalized[] = [
                "temporary_path" => $temporaryPath,
                "extension" => $allowedTypes[$mimeType],
            ];
        }
        return $normalized;
    }
}
