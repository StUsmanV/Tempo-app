import React, { useState } from "react";
import { supabase } from "./supabaseClient";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Quicksand:wght@400;500;600;700&display=swap');
  .auth-input { font-family: 'Quicksand', sans-serif; font-size: 14px; padding: 10px 12px; border-radius: 10px; border: 1px solid #d6dee6; width: 100%; box-sizing: border-box; background: #fff; color: #1b2a3d; }
  .auth-btn { font-family: 'Quicksand', sans-serif; font-weight: 600; font-size: 14px; padding: 10px 14px; border-radius: 12px; border: none; cursor: pointer; width: 100%; }
  .auth-btn:disabled { opacity: 0.55; cursor: default; }
`;

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2f6", fontFamily: "'Quicksand', system-ui, sans-serif", padding: 20 }}>
      <style>{STYLES}</style>
      <div style={{ background: "#fff", borderRadius: 18, padding: 32, width: "100%", maxWidth: 380, boxShadow: "0 8px 30px rgba(27,42,61,0.08)", color: "#1b2a3d" }}>
        <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 26, fontWeight: 700, textAlign: "center" }}>Tempo</div>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b6b7a", fontWeight: 600, textAlign: "center", marginBottom: 20 }}>
          El ritmo de tu enseñanza
        </div>
        {children}
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange, size = 13, activeBg = "#1d4e73" }) {
  return (
    <div style={{ display: "flex", gap: 6, background: "#eef2f6", padding: 4, borderRadius: 999 }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 600, fontSize: size, background: value === o.value ? activeBg : "transparent", color: value === o.value ? "#fff" : "#1b2a3d" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Pega el código del docente, lo verifica y deja elegir el nombre con el que el docente agregó al estudiante
function StudentCodeFields({ code, setCode, verified, setVerified, selectedId, setSelectedId, onError }) {
  const [verifying, setVerifying] = useState(false);

  const verify = async () => {
    onError("");
    if (!code.trim()) { onError("Pega el código que te envió tu profe."); return; }
    setVerifying(true);
    const { data, error } = await supabase.rpc("lookup_teacher_by_code", { p_code: code.trim() });
    setVerifying(false);
    if (error) { onError("No pudimos verificar el código. Intenta de nuevo."); return; }
    if (!data) { setVerified(null); onError("No encontramos ese código. Revisa que esté completo y sin espacios."); return; }
    setVerified(data);
    setSelectedId("");
  };

  return (
    <>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#5b6b7a", marginBottom: 6 }}>Código de tu profe</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="auth-input"
            style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
            placeholder="Pega aquí el código"
            value={code}
            onChange={(e) => { setCode(e.target.value); setVerified(null); setSelectedId(""); }}
          />
          <button type="button" className="auth-btn" style={{ width: "auto", background: "#1d4e73", color: "#fff", padding: "10px 14px" }} onClick={verify} disabled={verifying}>
            {verifying ? "…" : "Verificar"}
          </button>
        </div>
      </div>

      {verified && (
        <>
          <div style={{ fontSize: 12, color: "#3f8fa0", fontWeight: 600 }}>✓ Profe: {verified.teacher_name || "tu profe"}</div>
          {(verified.students || []).length === 0 ? (
            <div style={{ fontSize: 11, color: "#bd5236" }}>
              Tu profe todavía no te ha agregado como estudiante (o todos los nombres ya fueron elegidos). Pídele que te agregue con tu nombre y vuelve a intentar.
            </div>
          ) : (
            <select className="auth-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required>
              <option value="">Selecciona tu nombre</option>
              {verified.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </>
      )}
    </>
  );
}

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [role, setRole] = useState("profesor"); // profesor | estudiante
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

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
        return;
      }

      if (role === "estudiante") {
        if (!verified) throw new Error("Primero pega y verifica el código de tu profe.");
        if (!selectedId) throw new Error("Selecciona tu nombre en la lista.");
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      // Si Supabase pide confirmar el correo, todavía no hay sesión: se termina de conectar al iniciar sesión
      if (!signUpData.session) {
        setInfo(
          role === "estudiante"
            ? "Revisa tu correo para confirmar tu cuenta. Después inicia sesión y pega el código de tu profe para conectarte."
            : "Revisa tu correo para confirmar tu cuenta y luego inicia sesión."
        );
        return;
      }

      const userId = signUpData.user.id;
      if (role === "profesor") {
        const { error: insertError } = await supabase.from("teachers").insert({ id: userId, teacher_name: teacherName || "" });
        if (insertError) throw insertError;
      } else {
        const { error: claimError } = await supabase.rpc("claim_student", { p_code: code.trim(), p_student_id: selectedId });
        if (claimError) throw claimError;
      }
      onAuthed();
    } catch (err) {
      setError(err.message || "Ocurrió un error, intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <div style={{ marginBottom: 18 }}>
        <Segmented
          value={mode}
          onChange={(v) => { setMode(v); setError(""); setInfo(""); }}
          options={[{ value: "login", label: "Iniciar sesión" }, { value: "signup", label: "Crear cuenta" }]}
        />
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "signup" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#5b6b7a", marginBottom: 6 }}>Soy...</div>
            <Segmented
              value={role}
              onChange={(v) => { setRole(v); setError(""); }}
              size={12}
              activeBg="#2f6fa8"
              options={[{ value: "profesor", label: "Profesor" }, { value: "estudiante", label: "Estudiante" }]}
            />
          </div>
        )}

        {mode === "signup" && role === "profesor" && (
          <input className="auth-input" placeholder="Tu nombre, profe" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} required />
        )}

        {mode === "signup" && role === "estudiante" && (
          <StudentCodeFields code={code} setCode={setCode} verified={verified} setVerified={setVerified} selectedId={selectedId} setSelectedId={setSelectedId} onError={setError} />
        )}

        <input className="auth-input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="auth-input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

        {error && <div style={{ fontSize: 12, color: "#bd5236" }}>{error}</div>}
        {info && <div style={{ fontSize: 12, color: "#3f8fa0" }}>{info}</div>}

        <button className="auth-btn" type="submit" disabled={loading} style={{ background: "#2f6fa8", color: "#fff", marginTop: 6 }}>
          {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>
    </Shell>
  );
}

// Pantalla para cuentas que ya iniciaron sesión pero todavía no están conectadas a un docente (o no tienen perfil de docente)
export function LinkAccount({ onLinked, onLogout }) {
  const [tab, setTab] = useState("estudiante");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const link = async () => {
    setError("");
    if (!verified) { setError("Primero pega y verifica el código de tu profe."); return; }
    if (!selectedId) { setError("Selecciona tu nombre en la lista."); return; }
    setLoading(true);
    const { error: claimError } = await supabase.rpc("claim_student", { p_code: code.trim(), p_student_id: selectedId });
    setLoading(false);
    if (claimError) { setError(claimError.message); return; }
    onLinked();
  };

  const createTeacher = async () => {
    setError("");
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("teachers").insert({ id: user.id, teacher_name: teacherName || "" });
    setLoading(false);
    if (insertError) { setError(insertError.message); return; }
    onLinked();
  };

  return (
    <Shell>
      <div style={{ fontSize: 13, color: "#5b6b7a", textAlign: "center", marginBottom: 14 }}>
        Tu cuenta todavía no está conectada. Elige cómo quieres usar Tempo:
      </div>
      <div style={{ marginBottom: 14 }}>
        <Segmented
          value={tab}
          onChange={(v) => { setTab(v); setError(""); }}
          options={[{ value: "estudiante", label: "Soy estudiante" }, { value: "profesor", label: "Soy profesor" }]}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tab === "estudiante" ? (
          <>
            <StudentCodeFields code={code} setCode={setCode} verified={verified} setVerified={setVerified} selectedId={selectedId} setSelectedId={setSelectedId} onError={setError} />
            {error && <div style={{ fontSize: 12, color: "#bd5236" }}>{error}</div>}
            <button className="auth-btn" disabled={loading} style={{ background: "#2f6fa8", color: "#fff" }} onClick={link}>
              {loading ? "Un momento…" : "Conectarme con mi profe"}
            </button>
          </>
        ) : (
          <>
            <input className="auth-input" placeholder="Tu nombre, profe" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} />
            {error && <div style={{ fontSize: 12, color: "#bd5236" }}>{error}</div>}
            <button className="auth-btn" disabled={loading} style={{ background: "#2f6fa8", color: "#fff" }} onClick={createTeacher}>
              {loading ? "Un momento…" : "Crear mi perfil de profesor"}
            </button>
          </>
        )}
        <button type="button" onClick={onLogout} style={{ border: "none", background: "none", color: "#5b6b7a", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
          Cerrar sesión
        </button>
      </div>
    </Shell>
  );
}
