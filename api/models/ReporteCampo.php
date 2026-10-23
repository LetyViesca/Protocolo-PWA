<?php
namespace Models;

use Config\Database;
use PDO;

class ReporteCampo {
    private $conn;

    public function __construct() {
        $this->conn = Database::getConnection();
    }

    public function guardarReporte($data) {
        $this->conn->beginTransaction();

        try {
            // 1. Insertar en Reporte_atencion
            $stmt = $this->conn->prepare("INSERT INTO Reporte_atencion 
                (folio_servicio, fecha_atencion, id_unidad, id_usuario_paramedico, tipo_servicio, id_asociacion) 
                VALUES (:folio, NOW(), :unidad, :usuario, :tipo, :asoc)");

            $stmt->execute([
                ':folio'   => 'REP-' . date('Ymd') . '-' . rand(1000, 9999),
                ':unidad'  => $data['id_unidad'] ?? 1,
                ':usuario' => $data['id_usuario'] ?? 1,
                ':tipo'    => $data['tipo_servicio'] ?? 'MEDICO',
                ':asoc'    => $data['id_asociacion'] ?? 1
            ]);

            $idReporte = $this->conn->lastInsertId();

            // 2. Insertar Paciente si viene en el payload
            if (!empty($data['paciente'])) {
                $p = $data['paciente'];
                $stmtP = $this->conn->prepare("INSERT INTO paciente 
                    (id_reporte, nombre, apellido_paterno, apellido_materno, edad, sexo, codigo_triage) 
                    VALUES (:id_rep, :nom, :paterno, :materno, :edad, :sexo, :triage)");

                $stmtP->execute([
                    ':id_rep'  => $idReporte,
                    ':nom'     => $p['nombre'] ?? 'Desconocido',
                    ':paterno' => $p['apellido_paterno'] ?? '',
                    ':materno' => $p['apellido_materno'] ?? '',
                    ':edad'    => $p['edad'] ?? 0,
                    ':sexo'    => $p['sexo'] ?? 'NO_ESPECIFICADO',
                    ':triage'  => $p['codigo_triage'] ?? 'VERDE'
                ]);
            }

            $this->conn->commit();

            return [
                "status" => "success",
                "mensaje" => "Reporte prehospitalario registrado correctamente",
                "id_reporte" => $idReporte
            ];

        } catch (\Exception $e) {
            $this->conn->rollBack();
            throw $e;
        }
    }
}
?>