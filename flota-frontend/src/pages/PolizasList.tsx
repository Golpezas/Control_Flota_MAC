import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/vehiculos';
import { Link } from 'react-router-dom';
import axios from 'axios';

interface Poliza {
    id: string;
    empresa: string;
    numero_poliza: string;
    filename: string;
    file_id: string;
    fecha_subida: string;
}

function isAxiosError(error: unknown): error is { response: { data: { detail?: string } } } {
    if (error == null || typeof error !== "object") return false;
    if (!("response" in error)) return false;

    const err = error as { response?: unknown };
    if (typeof err.response !== "object" || err.response == null) return false;
    if (!("data" in err.response)) return false;

    const data = (err.response as { data?: unknown }).data;
    return typeof data === "object";
}

const PolizasList: React.FC = () => {
    const [polizas, setPolizas] = useState<Poliza[]>([]);
    const [loading, setLoading] = useState(true);

    const [form, setForm] = useState({ empresa: '', numero_poliza: '', file: null as File | null });
    const [editingId, setEditingId] = useState<string | null>(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    useEffect(() => {
        cargarPolizas();
    }, []);

    const cargarPolizas = async () => {
        try {
            const res = await apiClient.get<Poliza[]>('/polizas');
            setPolizas(res.data);
        } catch (error: unknown) {
            console.error("Error al cargar pólizas:", error);
            alert("Error al cargar pólizas. Reintentá en unos segundos.");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.file && !editingId) {
        return alert("Selecciona un archivo para agregar nueva póliza");
    }

    const formData = new FormData();
    formData.append('empresa', form.empresa.trim());
    formData.append('numero_poliza', form.numero_poliza.trim());
    if (form.file) {
        formData.append('file', form.file);
    }

    try {
        if (editingId) {
            await axios.put(`${API_URL}/polizas/${editingId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
        } else {
            await axios.post(`${API_URL}/polizas`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
        }

        cargarPolizas();
        setForm({ empresa: '', numero_poliza: '', file: null });
        setEditingId(null);
        alert("Póliza guardada correctamente");
    } catch (error: unknown) {
        console.error("Error al guardar póliza:", error);
        let mensaje = "Error al guardar la póliza";

        if (isAxiosError(error) && error.response?.data?.detail) {
            mensaje = error.response.data.detail;
        }

        alert(mensaje);
    }
};

    const eliminar = async (id: string) => {
        if (!confirm("¿Seguro que querés eliminar esta póliza?")) return;
        try {
            await apiClient.delete(`/polizas/${id}`);
            cargarPolizas();
        } catch (error: unknown) {
            console.error("Error al eliminar póliza:", error);
            alert("Error al eliminar la póliza");
        }
    };

    const editar = (p: Poliza) => {
        setForm({ empresa: p.empresa, numero_poliza: p.numero_poliza, file: null });
        setEditingId(p.id);
    };

    return (
        <div style={{ padding: '30px', maxWidth: '1000px', margin: '0 auto' }}>
            <h1 style={{ color: '#1D3557', marginBottom: '30px' }}>📜 Pólizas de Seguros</h1>

            <div style={{ background: '#f0f8ff', padding: '20px', borderRadius: '12px', marginBottom: '40px' }}>
                <h2>{editingId ? 'Modificar' : 'Agregar'} Póliza</h2>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder="Empresa de Seguros"
                        value={form.empresa}
                        onChange={e => setForm({...form, empresa: e.target.value})}
                        required
                        style={{ width: '300px', padding: '10px', marginRight: '10px' }}
                    />
                    <input
                        type="text"
                        placeholder="Número de Póliza"
                        value={form.numero_poliza}
                        onChange={e => setForm({...form, numero_poliza: e.target.value})}
                        required
                        style={{ width: '200px', padding: '10px', marginRight: '10px' }}
                    />
                    <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={e => setForm({...form, file: e.target.files?.[0] || null})}
                        required={!editingId}
                        style={{ padding: '10px' }}
                    />
                    <button type="submit" style={{ padding: '10px 20px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px' }}>
                        {editingId ? 'Actualizar' : 'Agregar'}
                    </button>
                    {editingId && <button type="button" onClick={() => { setEditingId(null); setForm({empresa: '', numero_poliza: '', file: null}); }} style={{ marginLeft: '10px' }}>
                        Cancelar
                    </button>}
                </form>
            </div>

            <h2>Lista de Pólizas ({polizas.length})</h2>
            {loading ? <p>Cargando...</p> : polizas.length === 0 ? <p>No hay pólizas registradas.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#1D3557', color: 'white' }}>
                        <tr>
                            <th style={{ padding: '15px', textAlign: 'left' }}>Empresa</th>
                            <th style={{ padding: '15px', textAlign: 'left' }}>Número de Póliza</th>
                            <th style={{ padding: '15px', textAlign: 'left' }}>Archivo</th>
                            <th style={{ padding: '15px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {polizas.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '15px' }}>{p.empresa}</td>
                                <td style={{ padding: '15px' }}><strong>{p.numero_poliza}</strong></td>
                                <td style={{ padding: '15px' }}>{p.filename}</td>
                                <td style={{ padding: '15px', textAlign: 'center' }}>
                                    <button onClick={() => window.open(`${API_URL}/api/archivos/descargar/${p.file_id}`, '_blank')} style={{ marginRight: '10px', background: '#2563eb', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '8px' }}>
                                        Descargar
                                    </button>
                                    <button onClick={() => editar(p)} style={{ marginRight: '10px', background: '#f59e0b', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '8px' }}>
                                        Editar
                                    </button>
                                    <button onClick={() => eliminar(p.id)} style={{ background: '#dc2626', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '8px' }}>
                                        Eliminar
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <Link to="/" style={{ display: 'block', marginTop: '40px', color: '#457B9D', fontWeight: 'bold' }}>
                ← Volver al Dashboard
            </Link>
        </div>
    );
};

export default PolizasList;