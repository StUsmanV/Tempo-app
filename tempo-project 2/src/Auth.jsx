import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [role, setRole] = useState("profesor"); // profesor | estudiante
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [unclaimedStudents, setUnclaimedStudents] = useState([]);
  const [selectedStudentRowId, setSelectedStudentRowId] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode === "signup" && role === "estudiante") {
      supabase
        .from("teachers")
        .select("id, teacher_name")
        .then(({ data, error }) => {
          if (!error) setTeachers(data || []);
        });
    }
  }, [mode, role]);

  useEffect(() => {
    if (mode === "signup" && role === "estudiante" && selectedTeacherId) {
      supabase
        .from("students")
        .select("id, name")
        .eq("teacher_id", selectedTeacherId)
        .is("user_id", null)
        .then(({ data, error }) => {
          if (!error) setUnclaimedStudents(data || []);
        });
    } else {
      setUnclaimedStudents([]);
    }
  }, [mode, role, selectedTeacherId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthed();
      } else {
        if (role === "estudiante" && !selectedTeacherId) throw new Error("Selecciona a tu profe.");
        if (role === "estudiante" && !selectedStudentRowId) throw new Error("Selecciona tu nombre en la lista de tu profe.");

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;

        const userId = signUpData.user?.id;
        if (!userId) {
          setInfo("Revisa tu correo para confirmar tu cuenta y luego inicia sesión.");
          setLoading(false);
          return;
        }

        if (role === "profesor") {
          const { error: insertError } = await supabase
            .from("teachers")
            .insert({ id: userId, teacher_name: teacherName || "" });
          if (insertError) throw insertError;
        } else {
          const { error: claimError } = await supabase
            .from("students")
            .update({ user_id: userId })
            .eq("id", selectedStudentRowId)
            .is("user_id", null);
          if (claimError) throw claimError;
        }

        onAuthed();
      }
    } catch (err) {
      setError(err.message || "Ocurrió un error, intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2f6", fontFamily: "'Quicksand', system-ui, sans-serif", padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Quicksand:wght@400;500;600;700&display=swap');
        .auth-input { font-family: 'Quicksand', sans-serif; font-size: 14px; padding: 10px 12px; border-radius: 10px; border: 1px solid #d6dee6; width: 100%; box-sizing: border-box; }
        .auth-btn { font-family: 'Quicksand', sans-serif; font-weight: 600; font-size: 14px; padding: 10px 14px; border-radius: 12px; border: none; cursor: pointer; width: 100%; }
      `}</style>
      <div style={{ background: "#fff", borderRadius: 18, padding: 32, width: "100%", maxWidth: 380, boxShadow: "0 8px 30px rgba(27,42,61,0.08)" }}>
        <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 26, fontWeight: 700, color: "#1b2a3d", textAlign: "center" }}>Tempo</div>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b6b7a", fontWeight: 600, textAlign: "center", marginBottom: 20 }}>
          El ritmo de tu enseñanza
        </div>

        <div style={{ display: "flex", gap: 6, background: "#eef2f6", padding: 4, borderRadius: 999, marginBottom: 18 }}>
          <button type="button" onClick={() => setMode("login")} style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: mode === "login" ? "#1d4e73" : "transparent", color: mode === "login" ? "#fff" : "#1b2a3d" }}>
            Iniciar sesión
          </button>
          <button type="button" onClick={() => setMode("signup")} style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: mode === "signup" ? "#1d4e73" : "transparent", color: mode === "signup" ? "#fff" : "#1b2a3d" }}>
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#5b6b7a", marginBottom: 6 }}>Soy...</div>
              <div style={{ display: "flex", gap: 6, background: "#eef2f6", padding: 4, borderRadius: 999 }}>
                <button type="button" onClick={() => setRole("profesor")} style={{ flex: 1, padding: "6px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12, background: role === "profesor" ? "#2f6fa8" : "transparent", color: role === "profesor" ? "#fff" : "#1b2a3d" }}>
                  Profesor
                </button>
                <button type="button" onClick={() => setRole("estudiante")} style={{ flex: 1, padding: "6px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12, background: role === "estudiante" ? "#2f6fa8" : "transparent", color: role === "estudiante" ? "#fff" : "#1b2a3d" }}>
                  Estudiante
                </button>
              </div>
            </div>
          )}

          {mode === "signup" && role === "profesor" && (
            <input className="auth-input" placeholder="Tu nombre, profe" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} required />
          )}

          {mode === "signup" && role === "estudiante" && (
            <>
              <select className="auth-input" value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} required>
                <option value="">Selecciona a tu profe</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.teacher_name || "Profe sin nombre"}</option>)}
              </select>
              {selectedTeacherId && (
                <select className="auth-input" value={selectedStudentRowId} onChange={(e) => setSelectedStudentRowId(e.target.value)} required>
                  <option value="">Selecciona tu nombre</option>
                  {unclaimedStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              {selectedTeacherId && unclaimedStudents.length === 0 && (
                <div style={{ fontSize: 11, color: "#bd5236" }}>Tu profe todavía no te ha agregado como estudiante — pídele que lo haga primero.</div>
              )}
            </>
          )}

          <input className="auth-input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

          {error && <div style={{ fontSize: 12, color: "#bd5236" }}>{error}</div>}
          {info && <div style={{ fontSize: 12, color: "#3f8fa0" }}>{info}</div>}

          <button className="auth-btn" type="submit" disabled={loading} style={{ background: "#2f6fa8", color: "#fff", marginTop: 6 }}>
            {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}
