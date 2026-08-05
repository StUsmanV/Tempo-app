import React, { useState, useEffect, useRef } from "react";
import { Music, Plus, Calendar, User, Wallet, ClipboardList, BarChart3, AlertTriangle, Check, X, RefreshCw, ChevronDown, ChevronRight, Trash2, MoreVertical, Sun, Moon, Download, MessageCircle, Repeat, LogOut } from "lucide-react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";

const DEFAULT_PACKAGES = [
  { id: "individual", name: "Clase individual", credits: 1, validityDays: 30, price: 60000 },
  { id: "flex", name: "Pase flex", credits: 4, validityDays: 30, price: 220000 },
  { id: "enfoque", name: "Pase enfoque", credits: 8, validityDays: 30, price: 400000 },
  { id: "pasaporte", name: "Pasaporte", credits: 24, validityDays: 180, price: 1080000 },
];

const EMPTY_TEACHER_PROFILE = {
  age: "",
  birthday: "",
  bio: "",
  credentials: "",
  contactEmail: "",
  contactPhone: "",
  social: { instagram: "", facebook: "", whatsapp: "", website: "" },
};

const uid = () => Math.random().toString(36).slice(2, 10);

function formatCOP(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr) - new Date());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fileToCompressedImage(file, maxWidth = 700, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- Traducción entre las filas de Supabase (snake_case) y el modelo de la app (camelCase) ---

function rowToStudent(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    packageId: row.package_id,
    creditsRemaining: row.credits_remaining,
    creditsTotal: row.credits_total,
    expiry: row.expiry,
    birthday: row.birthday || "",
    materialNote: row.material_note || "",
    challengeName: row.challenge_name || "",
    challengeDay: row.challenge_day || 0,
    challengeTotal: row.challenge_total || 0,
    pagoPendiente: row.pago_pendiente || false,
    phone: row.phone || "",
    privateNotes: row.private_notes || "",
    repertoire: row.repertoire || [],
    subject: row.subject || "",
    referredBy: row.referred_by || "",
    paymentRequests: row.payment_requests || [],
    classes: row.classes || [],
  };
}

function studentToRow(s, teacherId) {
  return {
    id: s.id,
    teacher_id: teacherId,
    user_id: s.userId || null,
    name: s.name,
    package_id: s.packageId,
    credits_remaining: s.creditsRemaining,
    credits_total: s.creditsTotal,
    expiry: s.expiry,
    birthday: s.birthday,
    material_note: s.materialNote,
    challenge_name: s.challengeName,
    challenge_day: s.challengeDay,
    challenge_total: s.challengeTotal,
    pago_pendiente: s.pagoPendiente,
    phone: s.phone,
    private_notes: s.privateNotes,
    repertoire: s.repertoire,
    subject: s.subject,
    referred_by: s.referredBy || null,
    payment_requests: s.paymentRequests,
    classes: s.classes,
  };
}

function rowToTeacherFields(row) {
  return {
    teacherName: row.teacher_name || "",
    packages: row.packages && row.packages.length ? row.packages : DEFAULT_PACKAGES,
    qrCode: row.qr_code || "",
    paymentInstructions: row.payment_instructions || "",
    darkMode: row.dark_mode || false,
    subjects: row.subjects || [],
    teacherProfile: { ...EMPTY_TEACHER_PROFILE, ...(row.teacher_profile || {}), social: { ...EMPTY_TEACHER_PROFILE.social, ...((row.teacher_profile || {}).social || {}) } },
  };
}

function teacherFieldsToRow(data) {
  return {
    teacher_name: data.teacherName,
    packages: data.packages,
    qr_code: data.qrCode,
    payment_instructions: data.paymentInstructions,
    dark_mode: data.darkMode,
    subjects: data.subjects,
    teacher_profile: data.teacherProfile,
  };
}

export default function CompasApp() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out
  const [role, setRole] = useState(null); // "profesor" | "estudiante"
  const [teacherId, setTeacherId] = useState(null);
  const [myStudentRowId, setMyStudentRowId] = useState(null);
  const [data, setData] = useState(null);
  const [view, setView] = useState("profesor");
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [studentPortalId, setStudentPortalId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const saveTimer = useRef(null);
  const prevStudentIdsRef = useRef([]);
  const skipNextSaveRef = useRef(false);

  // --- Sesión ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // --- Averiguar el rol y cargar los datos correspondientes ---
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      setLoaded(false);
      const userId = session.user.id;

      const { data: teacherRow } = await supabase.from("teachers").select("*").eq("id", userId).maybeSingle();

      if (teacherRow) {
        if (cancelled) return;
        setRole("profesor");
        setTeacherId(userId);
        const { data: studentRows } = await supabase.from("students").select("*").eq("teacher_id", userId);
        if (cancelled) return;
        prevStudentIdsRef.current = (studentRows || []).map((r) => r.id);
        skipNextSaveRef.current = true;
        setData({ ...rowToTeacherFields(teacherRow), students: (studentRows || []).map(rowToStudent) });
        setLoaded(true);
        return;
      }

      const { data: studentRow } = await supabase.from("students").select("*").eq("user_id", userId).maybeSingle();
      if (studentRow) {
        if (cancelled) return;
        setRole("estudiante");
        setTeacherId(studentRow.teacher_id);
        setMyStudentRowId(studentRow.id);
        const { data: teacherRow2 } = await supabase.from("teachers").select("*").eq("id", studentRow.teacher_id).maybeSingle();
        if (cancelled) return;
        prevStudentIdsRef.current = [studentRow.id];
        skipNextSaveRef.current = true;
        setData({ ...rowToTeacherFields(teacherRow2 || {}), students: [rowToStudent(studentRow)] });
        setStudentPortalId(studentRow.id);
        setView("estudiante");
        setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [session]);

  // --- Suscripción en tiempo real ---
  useEffect(() => {
    if (!loaded || !teacherId) return;
    const channel = supabase
      .channel("tempo-sync-" + teacherId)
      .on("postgres_changes", { event: "*", schema: "public", table: "students", filter: `teacher_id=eq.${teacherId}` }, () => {
        refetchStudents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teachers", filter: `id=eq.${teacherId}` }, () => {
        refetchTeacher();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loaded, teacherId, role]);

  const refetchStudents = async () => {
    if (role === "profesor") {
      const { data: rows } = await supabase.from("students").select("*").eq("teacher_id", teacherId);
      skipNextSaveRef.current = true;
      prevStudentIdsRef.current = (rows || []).map((r) => r.id);
      setData((d) => (d ? { ...d, students: (rows || []).map(rowToStudent) } : d));
    } else if (myStudentRowId) {
      const { data: row } = await supabase.from("students").select("*").eq("id", myStudentRowId).maybeSingle();
      if (row) {
        skipNextSaveRef.current = true;
        setData((d) => (d ? { ...d, students: [rowToStudent(row)] } : d));
      }
    }
  };

  const refetchTeacher = async () => {
    const { data: row } = await supabase.from("teachers").select("*").eq("id", teacherId).maybeSingle();
    if (row) {
      skipNextSaveRef.current = true;
      setData((d) => (d ? { ...d, ...rowToTeacherFields(row) } : d));
    }
  };

  // --- Guardar cambios en Supabase ---
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!loaded || !data || !session) return;
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (role === "profesor") {
          const { error: teacherErr } = await supabase.from("teachers").update(teacherFieldsToRow(data)).eq("id", teacherId);
          if (teacherErr) throw teacherErr;

          const currentIds = data.students.map((s) => s.id);
          const removedIds = prevStudentIdsRef.current.filter((id) => !currentIds.includes(id));
          if (removedIds.length) {
            const { error: delErr } = await supabase.from("students").delete().in("id", removedIds);
            if (delErr) throw delErr;
          }
          if (data.students.length) {
            const { error: upsertErr } = await supabase.from("students").upsert(data.students.map((s) => studentToRow(s, teacherId)));
            if (upsertErr) throw upsertErr;
          }
          prevStudentIdsRef.current = currentIds;
        } else if (role === "estudiante" && myStudentRowId) {
          const mine = data.students.find((s) => s.id === myStudentRowId);
          if (mine) {
            const { error: updErr } = await supabase.from("students").update(studentToRow(mine, teacherId)).eq("id", myStudentRowId);
            if (updErr) throw updErr;
          }
        }
        setSaveError(null);
      } catch (e) {
        console.error("Error guardando en Supabase:", e);
        setSaveError(e.message || "No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo.");
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded, session, role, teacherId, myStudentRowId]);

  if (!authChecked) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6b6f6a" }}>Cargando…</div>;
  }

  if (!session) {
    return <Auth onAuthed={() => {}} />;
  }

  if (!loaded || !data) {
    return <div style={{ padding: 40, textAlign: "center", color: "#6b6f6a" }}>Cargando…</div>;
  }

  const updatePackage = (id, patch) => {
    setData((d) => ({ ...d, packages: d.packages.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  };

  const toggleDarkMode = () => setData((d) => ({ ...d, darkMode: !d.darkMode }));

  const setTeacherName = (name) => setData((d) => ({ ...d, teacherName: name }));

  const updateTeacherProfile = (patch) => setData((d) => ({ ...d, teacherProfile: { ...d.teacherProfile, ...patch } }));
  const updateTeacherSocial = (patch) => setData((d) => ({ ...d, teacherProfile: { ...d.teacherProfile, social: { ...d.teacherProfile.social, ...patch } } }));

  const addSubject = (name) => {
    if (!name.trim()) return;
    setData((d) => (d.subjects.includes(name.trim()) ? d : { ...d, subjects: [...d.subjects, name.trim()] }));
  };
  const removeSubject = (name) => setData((d) => ({ ...d, subjects: d.subjects.filter((s) => s !== name) }));

  const addPackage = () => {
    const newPkg = { id: uid(), name: "Nuevo paquete", credits: 1, validityDays: 30, price: 0 };
    setData((d) => ({ ...d, packages: [...d.packages, newPkg] }));
  };
  const removePackage = (id) => setData((d) => ({ ...d, packages: d.packages.filter((p) => p.id !== id) }));

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tempo-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addStudent = (name, packageId, referredById) => {
    const pkg = data.packages.find((p) => p.id === packageId);
    const now = new Date();
    const expiry = new Date(now.getTime() + pkg.validityDays * 24 * 60 * 60 * 1000);
    const student = {
      id: crypto.randomUUID(),
      name,
      packageId,
      creditsRemaining: pkg.credits,
      creditsTotal: pkg.credits,
      expiry: expiry.toISOString().slice(0, 10),
      birthday: "",
      materialNote: "",
      challengeName: "",
      challengeDay: 0,
      challengeTotal: 0,
      pagoPendiente: false,
      paymentRequests: [],
      phone: "",
      privateNotes: "",
      repertoire: [],
      subject: "",
      referredBy: referredById || "",
      classes: [],
    };
    setData((d) => ({
      ...d,
      students: [
        ...d.students.map((s) => (s.id === referredById ? { ...s, creditsRemaining: s.creditsRemaining + 1 } : s)),
        student,
      ],
    }));
    setSelectedStudentId(student.id);
  };

  const updateStudentProfile = (studentId, patch) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) => (s.id === studentId ? { ...s, ...patch } : s)),
    }));
  };

  const rechargeStudent = (studentId, packageId) => {
    const pkg = data.packages.find((p) => p.id === packageId);
    const now = new Date();
    const expiry = new Date(now.getTime() + pkg.validityDays * 24 * 60 * 60 * 1000);
    setData((d) => ({
      ...d,
      students: d.students.map((s) =>
        s.id === studentId
          ? { ...s, packageId, creditsRemaining: pkg.credits, creditsTotal: pkg.credits, expiry: expiry.toISOString().slice(0, 10) }
          : s
      ),
    }));
  };

  const scheduleClass = (studentId, date, time) => {
    const newClass = { id: uid(), date, time, status: "programada", feedback: "", tasks: "", flagReprogramar: false, taskReviewed: false };
    setData((d) => ({
      ...d,
      students: d.students.map((s) => (s.id === studentId ? { ...s, classes: [...s.classes, newClass] } : s)),
    }));
  };

  const scheduleRecurringClasses = (studentId, startDate, time, weeks) => {
    const newClasses = Array.from({ length: weeks }).map((_, i) => {
      const d = new Date(startDate + "T00:00:00");
      d.setDate(d.getDate() + i * 7);
      return { id: uid(), date: d.toISOString().slice(0, 10), time, status: "programada", feedback: "", tasks: "", flagReprogramar: false, taskReviewed: false };
    });
    setData((d) => ({
      ...d,
      students: d.students.map((s) => (s.id === studentId ? { ...s, classes: [...s.classes, ...newClasses] } : s)),
    }));
  };

  const completeClass = (studentId, classId, feedback, tasks) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) => {
        if (s.id !== studentId) return s;
        return {
          ...s,
          creditsRemaining: Math.max(0, s.creditsRemaining - 1),
          classes: s.classes.map((c) => (c.id === classId ? { ...c, status: "completada", feedback, tasks } : c)),
        };
      }),
    }));
  };

  const updateClassFeedback = (studentId, classId, feedback, tasks) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) => {
        if (s.id !== studentId) return s;
        return { ...s, classes: s.classes.map((c) => (c.id === classId ? { ...c, feedback, tasks } : c)) };
      }),
    }));
  };

  const toggleReprogramar = (studentId, classId) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) => {
        if (s.id !== studentId) return s;
        return { ...s, classes: s.classes.map((c) => (c.id === classId ? { ...c, flagReprogramar: !c.flagReprogramar } : c)) };
      }),
    }));
  };

  const toggleTaskReviewed = (studentId, classId) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) => {
        if (s.id !== studentId) return s;
        return { ...s, classes: s.classes.map((c) => (c.id === classId ? { ...c, taskReviewed: !c.taskReviewed } : c)) };
      }),
    }));
  };

  const setQrCode = (base64) => setData((d) => ({ ...d, qrCode: base64 }));
  const setPaymentInstructions = (text) => setData((d) => ({ ...d, paymentInstructions: text }));

  const submitPaymentRequest = (studentId, packageId, receiptImage) => {
    const pkg = data.packages.find((p) => p.id === packageId);
    const request = {
      id: uid(),
      packageId,
      amount: pkg ? pkg.price : 0,
      receiptImage,
      status: "pendiente",
      date: new Date().toISOString().slice(0, 10),
    };
    setData((d) => ({
      ...d,
      students: d.students.map((s) =>
        s.id === studentId
          ? { ...s, pagoPendiente: true, paymentRequests: [request, ...(s.paymentRequests || [])] }
          : s
      ),
    }));
  };

  const approvePaymentRequest = (studentId, requestId) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) => {
        if (s.id !== studentId) return s;
        const request = (s.paymentRequests || []).find((r) => r.id === requestId);
        if (!request) return s;
        const pkg = d.packages.find((p) => p.id === request.packageId);
        const now = new Date();
        const expiry = pkg ? new Date(now.getTime() + pkg.validityDays * 24 * 60 * 60 * 1000) : new Date(s.expiry);
        return {
          ...s,
          packageId: request.packageId,
          creditsRemaining: pkg ? pkg.credits : s.creditsRemaining,
          creditsTotal: pkg ? pkg.credits : s.creditsTotal,
          expiry: expiry.toISOString().slice(0, 10),
          pagoPendiente: false,
          paymentRequests: s.paymentRequests.map((r) => (r.id === requestId ? { ...r, status: "aprobado" } : r)),
        };
      }),
    }));
  };

  const rejectPaymentRequest = (studentId, requestId) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) =>
        s.id === studentId
          ? { ...s, paymentRequests: s.paymentRequests.map((r) => (r.id === requestId ? { ...r, status: "rechazado" } : r)) }
          : s
      ),
    }));
  };

  const markAbsence = (studentId, classId) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) => {
        if (s.id !== studentId) return s;
        return {
          ...s,
          creditsRemaining: Math.max(0, s.creditsRemaining - 1),
          classes: s.classes.map((c) => (c.id === classId ? { ...c, status: "ausencia" } : c)),
        };
      }),
    }));
  };

  const cancelClass = (studentId, classId) => {
    setData((d) => ({
      ...d,
      students: d.students.map((s) =>
        s.id === studentId ? { ...s, classes: s.classes.filter((c) => c.id !== classId) } : s
      ),
    }));
  };

  const removeStudent = (studentId) => {
    setData((d) => ({ ...d, students: d.students.filter((s) => s.id !== studentId) }));
    if (selectedStudentId === studentId) setSelectedStudentId(null);
  };

  return (
    <div className={data.darkMode ? "cp-root dark" : "cp-root"} style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", minHeight: "100%" }}>
      <Styles />
      <Header
        teacherName={data.teacherName}
        onNameChange={setTeacherName}
        view={view}
        setView={setView}
        darkMode={data.darkMode}
        toggleDarkMode={toggleDarkMode}
        exportBackup={exportBackup}
        role={role}
        onLogout={() => supabase.auth.signOut()}
      />
      {saveError && (
        <div style={{ maxWidth: 880, margin: "0 auto 16px", padding: "0 20px" }}>
          <div style={{ background: "var(--alert-bg)", border: "1px solid var(--coral)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13, color: "var(--alert-text)" }}>
            <span>⚠️ {saveError}</span>
            <button className="cp-btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setData((d) => ({ ...d }))}>
              Reintentar
            </button>
          </div>
        </div>
      )}
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 20px 60px" }}>
        {view === "profesor" ? (
          <ProfesorView
            data={data}
            updatePackage={updatePackage}
            addPackage={addPackage}
            removePackage={removePackage}
            addStudent={addStudent}
            rechargeStudent={rechargeStudent}
            scheduleClass={scheduleClass}
            scheduleRecurringClasses={scheduleRecurringClasses}
            completeClass={completeClass}
            cancelClass={cancelClass}
            markAbsence={markAbsence}
            updateClassFeedback={updateClassFeedback}
            updateStudentProfile={updateStudentProfile}
            toggleReprogramar={toggleReprogramar}
            toggleTaskReviewed={toggleTaskReviewed}
            removeStudent={removeStudent}
            selectedStudentId={selectedStudentId}
            setSelectedStudentId={setSelectedStudentId}
            setQrCode={setQrCode}
            setPaymentInstructions={setPaymentInstructions}
            approvePaymentRequest={approvePaymentRequest}
            rejectPaymentRequest={rejectPaymentRequest}
            updateTeacherProfile={updateTeacherProfile}
            updateTeacherSocial={updateTeacherSocial}
            addSubject={addSubject}
            removeSubject={removeSubject}
            setTeacherName={setTeacherName}
          />
        ) : (
          <EstudianteView
            data={data}
            studentPortalId={studentPortalId}
            setStudentPortalId={setStudentPortalId}
            submitPaymentRequest={submitPaymentRequest}
            updateStudentProfile={updateStudentProfile}
            locked={role === "estudiante"}
          />
        )}
      </div>
    </div>
  );
}

function TempoLogoIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="50" y1="22" x2="26" y2="78" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
      <line x1="50" y1="22" x2="74" y2="78" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="7" strokeLinecap="round" />
      <circle cx="50" cy="20" r="9" fill="#ffffff" />
      <circle cx="26" cy="80" r="9" fill="#ffffff" />
      <circle cx="74" cy="80" r="9" fill="#ffffff" strokeOpacity="0.55" />
    </svg>
  );
}

function Styles() {
  return (
    <style>{`
      :root {
        --ink: #1b2a3d;
        --paper: #eef2f6;
        --brass: #2f6fa8;
        --brass-dark: #1d4e73;
        --coral: #bd5236;
        --sage: #3f8fa0;
        --card: #ffffff;
        --line: #d6dee6;
        --muted: #5b6b7a;
        --muted-light: #8a97a3;
        --soft-bg: #e7edf2;
        --text-soft: #33414d;
        --alert-bg: #f6e6de;
        --alert-text: #7a2a17;
        --panel-dark: #1b2a3d;
        --font-display: 'Baloo 2', system-ui, sans-serif;
        --font-body: 'Quicksand', system-ui, sans-serif;
        --font-mono: 'IBM Plex Mono', monospace;
      }
      @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&family=Quicksand:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
      .cp-root.dark {
        --ink: #eef2f6;
        --paper: #14202e;
        --brass: #5ea1dd;
        --brass-dark: #2f6fa8;
        --coral: #e28268;
        --sage: #6fc4d6;
        --card: #1c2c3d;
        --line: #2e4257;
        --muted: #9fb0c1;
        --muted-light: #7c8ea1;
        --soft-bg: #223347;
        --text-soft: #d7e0e9;
        --alert-bg: #3a2a24;
        --alert-text: #f0c4b3;
      }
      .cp-root.dark ::placeholder { color: #7c8ea1; }
      .cp-btn {
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 600;
        padding: 8px 14px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: var(--card);
        color: var(--ink);
        cursor: pointer;
      }
      .cp-btn:hover { border-color: var(--brass); }
      .cp-btn-primary {
        background: var(--brass);
        border-color: var(--brass-dark);
        color: #ffffff;
      }
      .cp-btn-primary:hover { background: var(--brass-dark); color: #fff; }
      .cp-input, .cp-select {
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 500;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: #fff;
        color: var(--ink);
        width: 100%;
        box-sizing: border-box;
      }
      .cp-card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 18px 20px;
      }
      .cp-tab {
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 500;
        padding: 8px 16px;
        border-radius: 999px;
        cursor: pointer;
        border: 1px solid transparent;
      }
      .cp-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
        font-weight: 600;
      }
    `}</style>
  );
}

function Header({ teacherName, onNameChange, view, setView, darkMode, toggleDarkMode, exportBackup, role, onLogout }) {
  return (
    <div style={{ borderBottom: "1px solid var(--line)", marginBottom: 24 }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--brass-dark)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <TempoLogoIcon size={22} />
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 600, lineHeight: 1 }}>Tempo</div>
            <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, marginTop: 2 }}>El ritmo de tu enseñanza</div>
            {role === "profesor" ? (
              <input
                value={teacherName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Tu nombre, profe"
                style={{ border: "none", background: "transparent", fontSize: 12, color: "var(--muted)", padding: 0, marginTop: 2 }}
              />
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Estudiante de {teacherName || "tu profe"}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="cp-btn" style={{ padding: "6px 8px" }} onClick={toggleDarkMode} aria-label="Cambiar modo oscuro">
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          {role === "profesor" && (
            <button className="cp-btn" style={{ padding: "6px 8px" }} onClick={exportBackup} aria-label="Descargar copia de tus datos">
              <Download size={14} />
            </button>
          )}
          {role === "profesor" && (
            <div style={{ display: "flex", gap: 6, background: "var(--soft-bg)", padding: 4, borderRadius: 999 }}>
              <div
                className="cp-tab"
                style={{ background: view === "profesor" ? "var(--brass-dark)" : "transparent", color: view === "profesor" ? "#fff" : "var(--ink)" }}
                onClick={() => setView("profesor")}
              >
                Vista profesor
              </div>
              <div
                className="cp-tab"
                style={{ background: view === "estudiante" ? "var(--brass-dark)" : "transparent", color: view === "estudiante" ? "#fff" : "var(--ink)" }}
                onClick={() => setView("estudiante")}
              >
                Vista estudiante
              </div>
            </div>
          )}
          <button className="cp-btn" style={{ padding: "6px 8px" }} onClick={onLogout} aria-label="Cerrar sesión">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfesorView(props) {
  const { data, selectedStudentId, setSelectedStudentId } = props;
  const selected = data.students.find((s) => s.id === selectedStudentId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <MiTempoHoyProfesor data={data} setSelectedStudentId={setSelectedStudentId} />
      <AgendaDiaria
        data={data}
        completeClass={props.completeClass}
        cancelClass={props.cancelClass}
        markAbsence={props.markAbsence}
        toggleReprogramar={props.toggleReprogramar}
        setSelectedStudentId={setSelectedStudentId}
      />
      <Analitica data={data} />
      <Reportes data={data} />
      <PerfilProfesor
        data={data}
        updateTeacherProfile={props.updateTeacherProfile}
        updateTeacherSocial={props.updateTeacherSocial}
        addSubject={props.addSubject}
        removeSubject={props.removeSubject}
        onNameChange={props.setTeacherName}
      />
      <Paquetes packages={data.packages} updatePackage={props.updatePackage} addPackage={props.addPackage} removePackage={props.removePackage} />
      <Cobro
        data={data}
        setQrCode={props.setQrCode}
        setPaymentInstructions={props.setPaymentInstructions}
        approvePaymentRequest={props.approvePaymentRequest}
        rejectPaymentRequest={props.rejectPaymentRequest}
        setSelectedStudentId={setSelectedStudentId}
      />
      <Estudiantes
        data={data}
        addStudent={props.addStudent}
        selectedStudentId={selectedStudentId}
        setSelectedStudentId={setSelectedStudentId}
        removeStudent={props.removeStudent}
      />
      {selected && (
        <StudentDetail
          student={selected}
          packages={data.packages}
          subjects={data.subjects}
          rechargeStudent={props.rechargeStudent}
          scheduleClass={props.scheduleClass}
          scheduleRecurringClasses={props.scheduleRecurringClasses}
          completeClass={props.completeClass}
          cancelClass={props.cancelClass}
          updateClassFeedback={props.updateClassFeedback}
          updateStudentProfile={props.updateStudentProfile}
          toggleReprogramar={props.toggleReprogramar}
          toggleTaskReviewed={props.toggleTaskReviewed}
        />
      )}
    </div>
  );
}

function saludoHora() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function MiTempoHoyProfesor({ data, setSelectedStudentId }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayMD = today.slice(5);

  const clasesHoy = data.students.flatMap((s) => s.classes.filter((c) => c.status === "programada" && c.date === today).map((c) => ({ ...c, studentId: s.id, studentName: s.name })));
  const bajos = data.students.filter((s) => s.creditsRemaining <= 1);
  const pagosPendientes = data.students.filter((s) => s.pagoPendiente);
  const cumples = data.students.filter((s) => s.birthday && s.birthday === todayMD);
  const tareasPorRevisar = [];
  data.students.forEach((s) => {
    const pendiente = s.classes.find((c) => c.status === "completada" && c.tasks && !c.taskReviewed);
    if (pendiente) tareasPorRevisar.push(s);
  });

  const highlights = [];
  if (clasesHoy.length > 0) highlights.push(`${clasesHoy.length} clase${clasesHoy.length > 1 ? "s" : ""} programada${clasesHoy.length > 1 ? "s" : ""}`);
  if (bajos.length > 0) highlights.push(`${bajos.length} estudiante${bajos.length > 1 ? "s" : ""} con paquete por terminar`);
  if (pagosPendientes.length > 0) highlights.push(`${pagosPendientes.length} pago${pagosPendientes.length > 1 ? "s" : ""} pendiente${pagosPendientes.length > 1 ? "s" : ""}`);
  cumples.forEach((s) => highlights.push({ text: `Hoy cumple años ${s.name}`, studentId: s.id }));
  tareasPorRevisar.forEach((s) => highlights.push({ text: `Revisa la tarea de ${s.name}`, studentId: s.id }));

  const acciones = [];
  pagosPendientes.forEach((s) => acciones.push({ label: `Enviar recordatorio a ${s.name}`, studentId: s.id }));
  clasesHoy.forEach((c) => {
    const s = data.students.find((st) => st.id === c.studentId);
    if (s && s.materialNote) acciones.push({ label: `Compartir material con ${s.name}`, studentId: s.id });
    if (c.flagReprogramar) acciones.push({ label: `Reprogramar a ${s.name}`, studentId: s.id });
  });

  return (
    <div className="cp-card" style={{ background: "var(--panel-dark)", color: "#fff", borderColor: "var(--panel-dark)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600 }}>{saludoHora()}, {data.teacherName || "profe"}</div>
      <div style={{ fontSize: 12, color: "#a9b8c6", marginTop: 2, marginBottom: 14 }}>Mi Tempo de hoy</div>

      <div className="cp-label" style={{ color: "#a9b8c6", marginBottom: 8 }}>Hoy tienes</div>
      {highlights.length === 0 ? (
        <div style={{ fontSize: 13, color: "#c9d3dc" }}>Todo tranquilo por ahora.</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {highlights.map((h, i) => {
            const isObj = typeof h === "object";
            return (
              <li
                key={i}
                style={{ fontSize: 13, cursor: isObj ? "pointer" : "default" }}
                onClick={() => isObj && setSelectedStudentId(h.studentId)}
              >
                · {isObj ? h.text : h}
              </li>
            );
          })}
        </ul>
      )}

      <div className="cp-label" style={{ color: "#a9b8c6", marginBottom: 8 }}>Acciones recomendadas</div>
      {acciones.length === 0 ? (
        <div style={{ fontSize: 13, color: "#c9d3dc" }}>Sin acciones pendientes por ahora.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {acciones.slice(0, 5).map((a, i) => (
            <button
              key={i}
              className="cp-btn"
              style={{ background: "transparent", borderColor: "#3a4a5c", color: "#fff", fontSize: 12 }}
              onClick={() => setSelectedStudentId(a.studentId)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaDiaria({ data, completeClass, cancelClass, markAbsence, toggleReprogramar, setSelectedStudentId }) {
  const [modo, setModo] = useState("hoy");
  const [completingKey, setCompletingKey] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [tasks, setTasks] = useState("");
  const [openMenuKey, setOpenMenuKey] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const todayLabel = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  const todasProgramadas = data.students.flatMap((s) =>
    s.classes.filter((c) => c.status === "programada").map((c) => ({ ...c, studentId: s.id, studentName: s.name }))
  );

  const hoy = todasProgramadas.filter((c) => c.date === today).sort((a, b) => a.time.localeCompare(b.time));

  const dias = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    return {
      dateStr,
      label: d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }),
      classes: todasProgramadas.filter((c) => c.date === dateStr).sort((a, b) => a.time.localeCompare(b.time)),
    };
  });

  const itemProps = { completingKey, setCompletingKey, feedback, setFeedback, tasks, setTasks, openMenuKey, setOpenMenuKey, completeClass, cancelClass, markAbsence, toggleReprogramar, setSelectedStudentId };

  return (
    <div className="cp-card" style={{ borderColor: "var(--brass)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={16} color="var(--brass-dark)" />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600 }}>Agenda</span>
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--soft-bg)", padding: 3, borderRadius: 999 }}>
          <div className="cp-tab" style={{ padding: "5px 12px", fontSize: 12, background: modo === "hoy" ? "var(--brass-dark)" : "transparent", color: modo === "hoy" ? "#fff" : "var(--ink)" }} onClick={() => setModo("hoy")}>Hoy</div>
          <div className="cp-tab" style={{ padding: "5px 12px", fontSize: 12, background: modo === "semana" ? "var(--brass-dark)" : "transparent", color: modo === "semana" ? "#fff" : "var(--ink)" }} onClick={() => setModo("semana")}>Semana</div>
        </div>
      </div>

      {modo === "hoy" ? (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, textTransform: "capitalize" }}>{todayLabel}</div>
          {hoy.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted-light)" }}>No tienes clases programadas para hoy.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {hoy.map((c) => <AgendaItem key={c.id} c={c} {...itemProps} />)}
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 14 }}>
          {dias.map((d) => (
            <div key={d.dateStr}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "capitalize", marginBottom: 6 }}>{d.label}</div>
              {d.classes.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted-light)" }}>Sin clases.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {d.classes.map((c) => <AgendaItem key={c.id} c={c} {...itemProps} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaItem({ c, completingKey, setCompletingKey, feedback, setFeedback, tasks, setTasks, openMenuKey, setOpenMenuKey, completeClass, cancelClass, markAbsence, toggleReprogramar, setSelectedStudentId }) {
  const key = c.id;
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, marginRight: 10 }}>{c.time}</span>
          <span
            style={{ fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            onClick={() => setSelectedStudentId(c.studentId)}
          >
            {c.studentName}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, position: "relative" }}>
          <button className="cp-btn cp-btn-primary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setCompletingKey(completingKey === key ? null : key)}>
            Completar y agregar retro
          </button>
          <button
            className="cp-btn"
            style={{ padding: "5px 8px" }}
            onClick={() => setOpenMenuKey(openMenuKey === key ? null : key)}
            aria-label="Más opciones"
          >
            <MoreVertical size={14} />
          </button>
          {openMenuKey === key && (
            <div
              style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 10,
                background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8,
                boxShadow: "0 4px 12px rgba(27,42,61,0.12)", minWidth: 150, overflow: "hidden",
              }}
            >
              <button
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, border: "none", background: "none", cursor: "pointer", color: "var(--ink)" }}
                onClick={() => { cancelClass(c.studentId, c.id); setOpenMenuKey(null); }}
              >
                Cancelar clase
              </button>
              <button
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, border: "none", background: "none", cursor: "pointer", color: "var(--coral)" }}
                onClick={() => { markAbsence(c.studentId, c.id); setOpenMenuKey(null); }}
              >
                Marcar ausencia
              </button>
              <button
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, border: "none", background: "none", cursor: "pointer", color: c.flagReprogramar ? "var(--brass-dark)" : "var(--ink)" }}
                onClick={() => { toggleReprogramar(c.studentId, c.id); setOpenMenuKey(null); }}
              >
                {c.flagReprogramar ? "Reprogramar ✓" : "Reprogramar"}
              </button>
            </div>
          )}
        </div>
      </div>
      {completingKey === key && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea className="cp-input" placeholder="Retroalimentación de la clase" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} />
          <textarea className="cp-input" placeholder="Tareas para la próxima clase" value={tasks} onChange={(e) => setTasks(e.target.value)} rows={2} />
          <button
            className="cp-btn cp-btn-primary"
            onClick={() => {
              completeClass(c.studentId, c.id, feedback, tasks);
              setCompletingKey(null); setFeedback(""); setTasks("");
            }}
          >
            Guardar y descontar 1 crédito
          </button>
        </div>
      )}
    </div>
  );
}

function Analitica({ data }) {
  const allClasses = data.students.flatMap((s) => s.classes.map((c) => ({ ...c, student: s.name })));
  const completadas = allClasses.filter((c) => c.status === "completada");
  const ingresoEstimado = data.students.reduce((sum, s) => {
    const pkg = data.packages.find((p) => p.id === s.packageId);
    return sum + (pkg ? pkg.price : 0);
  }, 0);
  const bajos = data.students.filter((s) => s.creditsRemaining <= 1).length;

  return (
    <div className="cp-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <BarChart3 size={16} color="var(--sage)" />
        <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Analítica</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Metric label="Clases dictadas" value={completadas.length} />
        <Metric label="Estudiantes activos" value={data.students.length} />
        <Metric label="Ingreso vigente estimado" value={formatCOP(ingresoEstimado)} />
        <Metric label="Con créditos bajos" value={bajos} accent={bajos > 0 ? "var(--coral)" : undefined} />
      </div>
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div style={{ background: "var(--soft-bg)", borderRadius: 10, padding: "12px 14px" }}>
      <div className="cp-label">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-mono)", color: accent || "var(--ink)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Paquetes({ packages, updatePackage, addPackage, removePackage }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cp-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wallet size={16} color="var(--sage)" />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Tus paquetes de crédito</span>
        </div>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </div>
      {open && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: "var(--muted-light)" }}>
            Estos 4 son solo una sugerencia de partida — edítalos, bórralos o crea los tuyos, a tu manera.
          </div>
          {packages.map((p) => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.8fr 0.9fr 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
              <div>
                <div className="cp-label">Nombre</div>
                <input className="cp-input" value={p.name} onChange={(e) => updatePackage(p.id, { name: e.target.value })} />
              </div>
              <div>
                <div className="cp-label">Créditos</div>
                <input className="cp-input" type="number" min={1} value={p.credits} onChange={(e) => updatePackage(p.id, { credits: Number(e.target.value) })} />
              </div>
              <div>
                <div className="cp-label">Vigencia (días)</div>
                <input className="cp-input" type="number" min={1} value={p.validityDays} onChange={(e) => updatePackage(p.id, { validityDays: Number(e.target.value) })} />
              </div>
              <div>
                <div className="cp-label">Precio (COP)</div>
                <input className="cp-input" type="number" min={0} value={p.price} onChange={(e) => updatePackage(p.id, { price: Number(e.target.value) })} />
              </div>
              <button className="cp-btn" style={{ padding: "6px 8px", alignSelf: "end" }} onClick={() => removePackage(p.id)} aria-label="Eliminar paquete">
                <Trash2 size={13} color="var(--coral)" />
              </button>
            </div>
          ))}
          <button className="cp-btn cp-btn-primary" style={{ alignSelf: "flex-start" }} onClick={addPackage}>
            <Plus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            Crear paquete
          </button>
        </div>
      )}
    </div>
  );
}

function PerfilProfesor({ data, updateTeacherProfile, updateTeacherSocial, addSubject, removeSubject, onNameChange }) {
  const [open, setOpen] = useState(false);
  const [subjectInput, setSubjectInput] = useState("");
  const p = data.teacherProfile || {};

  return (
    <div className="cp-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <User size={16} color="var(--sage)" />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Mi perfil de profesor</span>
        </div>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </div>

      {open && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted-light)", background: "var(--soft-bg)", borderRadius: 8, padding: "8px 10px" }}>
            Esta información la ven tus estudiantes (contacto y redes) y, en la versión final de la app, también nos ayudaría a nosotros como equipo de Tempo a entender mejor a los profes que la usan.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Nombre</div>
              <input className="cp-input" value={data.teacherName} onChange={(e) => onNameChange(e.target.value)} />
            </div>
            <div>
              <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Edad</div>
              <input className="cp-input" type="number" min={0} value={p.age} onChange={(e) => updateTeacherProfile({ age: e.target.value })} />
            </div>
            <div>
              <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Cumpleaños</div>
              <input
                className="cp-input"
                type="date"
                value={p.birthday ? `2024-${p.birthday}` : ""}
                onChange={(e) => updateTeacherProfile({ birthday: e.target.value.slice(5) })}
              />
            </div>
          </div>

          <div>
            <div className="cp-label" style={{ marginBottom: 4 }}>Credenciales / formación</div>
            <input className="cp-input" placeholder="Ej: Lic. en Música, Universidad X · 8 años de experiencia" value={p.credentials} onChange={(e) => updateTeacherProfile({ credentials: e.target.value })} />
          </div>

          <div>
            <div className="cp-label" style={{ marginBottom: 4 }}>Reseña de tu trayectoria</div>
            <textarea className="cp-input" rows={3} placeholder="Cuéntales a tus estudiantes quién eres como profe…" value={p.bio} onChange={(e) => updateTeacherProfile({ bio: e.target.value })} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div className="cp-label" style={{ marginBottom: 4 }}>Correo de contacto</div>
              <input className="cp-input" type="email" value={p.contactEmail} onChange={(e) => updateTeacherProfile({ contactEmail: e.target.value })} />
            </div>
            <div>
              <div className="cp-label" style={{ marginBottom: 4 }}>Teléfono de contacto</div>
              <input className="cp-input" value={p.contactPhone} onChange={(e) => updateTeacherProfile({ contactPhone: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="cp-label" style={{ marginBottom: 6 }}>Redes sociales</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input className="cp-input" placeholder="Instagram (usuario o link)" value={p.social?.instagram} onChange={(e) => updateTeacherSocial({ instagram: e.target.value })} />
              <input className="cp-input" placeholder="Facebook" value={p.social?.facebook} onChange={(e) => updateTeacherSocial({ facebook: e.target.value })} />
              <input className="cp-input" placeholder="WhatsApp" value={p.social?.whatsapp} onChange={(e) => updateTeacherSocial({ whatsapp: e.target.value })} />
              <input className="cp-input" placeholder="Sitio web" value={p.social?.website} onChange={(e) => updateTeacherSocial({ website: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="cp-label" style={{ marginBottom: 6 }}>Qué enseñas</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                className="cp-input"
                placeholder="Ej: Piano, Flauta traversa, Teoría musical…"
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { addSubject(subjectInput); setSubjectInput(""); } }}
              />
              <button className="cp-btn cp-btn-primary" onClick={() => { addSubject(subjectInput); setSubjectInput(""); }}>
                <Plus size={13} />
              </button>
            </div>
            {(data.subjects || []).length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted-light)" }}>Aún no has agregado lo que enseñas.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {data.subjects.map((s) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                    {s}
                    <button onClick={() => removeSubject(s)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted-light)", padding: 0 }} aria-label="Quitar materia">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Reportes({ data }) {
  const [open, setOpen] = useState(false);

  const exportarCSV = () => {
    const rows = [["Estudiante", "Fecha", "Hora", "Estado", "Paquete", "Valor paquete"]];
    data.students.forEach((s) => {
      const pkg = data.packages.find((p) => p.id === s.packageId);
      s.classes
        .filter((c) => c.status === "completada" || c.status === "ausencia")
        .forEach((c) => {
          rows.push([s.name, c.date, c.time, c.status, pkg?.name || "", pkg?.price || 0]);
        });
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tempo-ingresos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const porMes = {};
  data.students.forEach((s) => {
    const pkg = data.packages.find((p) => p.id === s.packageId);
    s.classes.filter((c) => c.status === "completada").forEach((c) => {
      const mes = c.date.slice(0, 7);
      if (!porMes[mes]) porMes[mes] = { clases: 0, estudiantes: new Set() };
      porMes[mes].clases += 1;
      porMes[mes].estudiantes.add(s.name);
    });
  });
  const meses = Object.keys(porMes).sort().reverse();

  const porEstudiante = data.students.map((s) => {
    const pkg = data.packages.find((p) => p.id === s.packageId);
    const completadas = s.classes.filter((c) => c.status === "completada").length;
    return { name: s.name, completadas, pkgName: pkg?.name, price: pkg?.price || 0 };
  }).filter((s) => s.completadas > 0);

  return (
    <div className="cp-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={16} color="var(--sage)" />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Reportes de ingresos</span>
        </div>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </div>

      {open && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <button className="cp-btn cp-btn-primary" style={{ alignSelf: "flex-start" }} onClick={exportarCSV}>
            <Download size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            Exportar CSV de clases dictadas
          </button>

          <div>
            <div className="cp-label" style={{ marginBottom: 8 }}>Por mes</div>
            {meses.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted-light)" }}>Aún no hay clases completadas.</div>
            ) : (
              meses.map((m) => (
                <div key={m} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span style={{ textTransform: "capitalize" }}>{new Date(m + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</span>
                  <span style={{ color: "var(--muted)" }}>{porMes[m].clases} clases · {porMes[m].estudiantes.size} estudiantes</span>
                </div>
              ))
            )}
          </div>

          <div>
            <div className="cp-label" style={{ marginBottom: 8 }}>Por estudiante</div>
            {porEstudiante.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted-light)" }}>Aún no hay clases completadas.</div>
            ) : (
              porEstudiante.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{s.name}</span>
                  <span style={{ color: "var(--muted)" }}>{s.completadas} clases · {s.pkgName}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Cobro({ data, setQrCode, setPaymentInstructions, approvePaymentRequest, rejectPaymentRequest, setSelectedStudentId }) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState(data.paymentInstructions || "");
  const [qrError, setQrError] = useState("");

  const handleQrUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setQrError("");
    try {
      const compressed = await fileToCompressedImage(file, 500, 0.8);
      setQrCode(compressed);
    } catch (err) {
      console.error("Error subiendo QR:", err);
      setQrError("No se pudo cargar esa imagen. Prueba con otra foto del QR.");
    }
  };

  const pendientes = data.students.flatMap((s) =>
    (s.paymentRequests || []).filter((r) => r.status === "pendiente").map((r) => ({ ...r, studentId: s.id, studentName: s.name }))
  );

  return (
    <div className="cp-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wallet size={16} color="var(--sage)" />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>
            Cobro con QR {pendientes.length > 0 && <span style={{ fontSize: 11, color: "var(--coral)" }}>({pendientes.length} por revisar)</span>}
          </span>
        </div>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </div>

      {open && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
            <div>
              <div className="cp-label" style={{ marginBottom: 6 }}>Tu QR de cobro</div>
              {data.qrCode ? (
                <img src={data.qrCode} alt="Código QR de cobro" style={{ width: 120, height: 120, objectFit: "contain", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
              ) : (
                <div style={{ width: 120, height: 120, border: "1px dashed var(--line)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted-light)", textAlign: "center", padding: 6 }}>
                  Sin QR cargado
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleQrUpload} style={{ marginTop: 8, fontSize: 11 }} />
              {qrError && <div style={{ fontSize: 11, color: "var(--coral)", marginTop: 6 }}>{qrError}</div>}
            </div>
            <div>
              <div className="cp-label" style={{ marginBottom: 6 }}>Instrucciones para el estudiante</div>
              <textarea
                className="cp-input"
                rows={3}
                placeholder="Ej: Nequi 300 123 4567 a nombre de María López. Envía el comprobante aquí después de pagar."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onBlur={() => setPaymentInstructions(instructions)}
              />
            </div>
          </div>

          <div>
            <div className="cp-label" style={{ marginBottom: 8 }}>Pagos por revisar</div>
            {pendientes.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted-light)" }}>No hay comprobantes pendientes de revisión.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendientes.map((r) => {
                  const pkg = data.packages.find((p) => p.id === r.packageId);
                  return (
                    <div key={r.id} style={{ display: "flex", gap: 12, border: "1px solid var(--line)", borderRadius: 10, padding: 10, alignItems: "center" }}>
                      {r.receiptImage && <img src={r.receiptImage} alt="Comprobante" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{ fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                          onClick={() => setSelectedStudentId(r.studentId)}
                        >
                          {r.studentName}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{pkg?.name} · {formatCOP(r.amount)} · {r.date}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="cp-btn cp-btn-primary" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => approvePaymentRequest(r.studentId, r.id)}>
                          Aprobar y recargar
                        </button>
                        <button className="cp-btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => rejectPaymentRequest(r.studentId, r.id)}>
                          Rechazar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Estudiantes({ data, addStudent, selectedStudentId, setSelectedStudentId, removeStudent }) {
  const [name, setName] = useState("");
  const [packageId, setPackageId] = useState(data.packages[0].id);
  const [referredById, setReferredById] = useState("");

  return (
    <div className="cp-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <User size={16} color="var(--sage)" />
        <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Estudiantes</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input className="cp-input" style={{ flex: 2, minWidth: 140 }} placeholder="Nombre del estudiante" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="cp-select" style={{ flex: 1, minWidth: 140 }} value={packageId} onChange={(e) => setPackageId(e.target.value)}>
          {data.packages.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          className="cp-btn cp-btn-primary"
          onClick={() => {
            if (!name.trim()) return;
            addStudent(name.trim(), packageId, referredById || null);
            setName(""); setReferredById("");
          }}
        >
          <Plus size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
          Agregar
        </button>
      </div>

      {data.students.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <select className="cp-select" style={{ maxWidth: 260 }} value={referredById} onChange={(e) => setReferredById(e.target.value)}>
            <option value="">¿Referido por alguien? (opcional)</option>
            {data.students.map((s) => <option key={s.id} value={s.id}>Referido por {s.name}</option>)}
          </select>
        </div>
      )}

      {data.students.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Aún no tienes estudiantes. Agrega el primero arriba.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {data.students.map((s) => {
            const pkg = data.packages.find((p) => p.id === s.packageId);
            const diasRestantes = daysUntil(s.expiry);
            const bajo = s.creditsRemaining <= 1 || (diasRestantes !== null && diasRestantes <= 0);
            return (
              <div
                key={s.id}
                onClick={() => setSelectedStudentId(s.id)}
                style={{
                  border: selectedStudentId === s.id ? "1.5px solid var(--brass)" : "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: "pointer",
                  position: "relative",
                  background: selectedStudentId === s.id ? "var(--soft-bg)" : "var(--card)",
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); removeStudent(s.id); }}
                  style={{ position: "absolute", top: 8, right: 8, border: "none", background: "none", cursor: "pointer", color: "var(--muted-light)" }}
                  aria-label="Eliminar estudiante"
                >
                  <Trash2 size={13} />
                </button>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{pkg?.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  {bajo && <AlertTriangle size={13} color="var(--coral)" />}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: bajo ? "var(--coral)" : "var(--sage)" }}>
                    {s.creditsRemaining}/{s.creditsTotal} créditos
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecordatorioWhatsApp({ student }) {
  const [copied, setCopied] = useState(false);
  const mensaje = `¡Hola ${student.name}! Te escribo de tu clase de música: te quedan ${student.creditsRemaining} crédito${student.creditsRemaining === 1 ? "" : "s"} y tu ciclo vence el ${student.expiry}. Cuando quieras recargar me avisas 🎵`;

  const enviar = () => {
    if (student.phone) {
      const digits = student.phone.replace(/[^0-9]/g, "");
      openLinkSafe(`https://wa.me/${digits}?text=${encodeURIComponent(mensaje)}`);
    } else {
      navigator.clipboard?.writeText(mensaje);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button className="cp-btn" onClick={enviar}>
      <MessageCircle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
      {student.phone ? "Enviar recordatorio por WhatsApp" : copied ? "¡Mensaje copiado!" : "Copiar mensaje de recordatorio"}
    </button>
  );
}

function openLinkSafe(url) {
  if (typeof openLink === "function") { openLink(url); return; }
  window.open(url, "_blank", "noopener,noreferrer");
}

function RepertorioEstudiante({ student, updateStudentProfile }) {
  const [piece, setPiece] = useState("");

  const addPiece = () => {
    if (!piece.trim()) return;
    const item = { id: uid(), name: piece.trim(), status: "aprendiendo" };
    updateStudentProfile(student.id, { repertoire: [...(student.repertoire || []), item] });
    setPiece("");
  };

  const toggleStatus = (id) => {
    updateStudentProfile(student.id, {
      repertoire: (student.repertoire || []).map((r) => (r.id === id ? { ...r, status: r.status === "aprendiendo" ? "dominado" : "aprendiendo" } : r)),
    });
  };

  const removePiece = (id) => {
    updateStudentProfile(student.id, { repertoire: (student.repertoire || []).filter((r) => r.id !== id) });
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Music size={14} color="var(--sage)" />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Repertorio y progreso</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input className="cp-input" placeholder="Ej: Für Elise" value={piece} onChange={(e) => setPiece(e.target.value)} />
        <button className="cp-btn cp-btn-primary" onClick={addPiece}>
          <Plus size={13} />
        </button>
      </div>
      {(student.repertoire || []).length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-light)" }}>Aún no has agregado piezas o técnicas.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {student.repertoire.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
              <span
                onClick={() => toggleStatus(r.id)}
                style={{ cursor: "pointer", color: r.status === "dominado" ? "var(--sage)" : "var(--brass-dark)", fontWeight: 500 }}
              >
                {r.status === "dominado" ? "✓" : "…"} {r.name}
              </span>
              <button onClick={() => removePiece(r.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted-light)", padding: 0 }} aria-label="Quitar">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentDetail({ student, packages, subjects, rechargeStudent, scheduleClass, scheduleRecurringClasses, completeClass, cancelClass, updateClassFeedback, updateStudentProfile, toggleReprogramar, toggleTaskReviewed }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [completingId, setCompletingId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [tasks, setTasks] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editFeedback, setEditFeedback] = useState("");
  const [editTasks, setEditTasks] = useState("");
  const [rechargePkg, setRechargePkg] = useState(student.packageId);

  const pendientes = student.classes.filter((c) => c.status === "programada").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const historial = student.classes.filter((c) => c.status === "completada" || c.status === "ausencia").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  return (
    <div className="cp-card" style={{ borderColor: "var(--brass)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{student.name}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Vence: {student.expiry}</div>
          <select
            className="cp-select"
            style={{ width: "auto", marginTop: 6, fontSize: 12, padding: "3px 8px" }}
            value={student.subject || ""}
            onChange={(e) => updateStudentProfile(student.id, { subject: e.target.value })}
          >
            <option value="">Materia sin definir</option>
            {(subjects || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select className="cp-select" style={{ width: 160 }} value={rechargePkg} onChange={(e) => setRechargePkg(e.target.value)}>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="cp-btn" onClick={() => rechargeStudent(student.id, rechargePkg)}>
            <RefreshCw size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            Recargar
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="cp-label" style={{ marginBottom: 8 }}>Créditos ({student.creditsRemaining}/{student.creditsTotal})</div>
        <TicketPunch total={student.creditsTotal} remaining={student.creditsRemaining} />
      </div>

      <div style={{ marginBottom: 20, background: "var(--soft-bg)", borderRadius: 10, padding: 14 }}>
        <div className="cp-label" style={{ marginBottom: 10 }}>Perfil y seguimiento (para Mi Tempo de hoy)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Cumpleaños</div>
            <input
              className="cp-input"
              type="date"
              value={student.birthday ? `2024-${student.birthday}` : ""}
              onChange={(e) => updateStudentProfile(student.id, { birthday: e.target.value.slice(5) })}
            />
          </div>
          <div>
            <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Material recurrente</div>
            <input
              className="cp-input"
              placeholder="Ej: tu libro de estudios"
              value={student.materialNote}
              onChange={(e) => updateStudentProfile(student.id, { materialNote: e.target.value })}
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr", gap: 10, marginBottom: 10 }}>
          <div>
            <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Reto de práctica</div>
            <input
              className="cp-input"
              placeholder="Ej: Reto de 21 días tocando piano"
              value={student.challengeName}
              onChange={(e) => updateStudentProfile(student.id, { challengeName: e.target.value })}
            />
          </div>
          <div>
            <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Día actual</div>
            <input className="cp-input" type="number" min={0} value={student.challengeDay} onChange={(e) => updateStudentProfile(student.id, { challengeDay: Number(e.target.value) })} />
          </div>
          <div>
            <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Total días</div>
            <input className="cp-input" type="number" min={0} value={student.challengeTotal} onChange={(e) => updateStudentProfile(student.id, { challengeTotal: Number(e.target.value) })} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Teléfono (para WhatsApp)</div>
            <input
              className="cp-input"
              placeholder="Ej: 3001234567"
              value={student.phone}
              onChange={(e) => updateStudentProfile(student.id, { phone: e.target.value })}
            />
          </div>
          <div>
            <div className="cp-label" style={{ marginBottom: 4, fontSize: 10 }}>Notas privadas (solo tú las ves)</div>
            <input
              className="cp-input"
              placeholder="Ej: le cuesta el ritmo, reforzar"
              value={student.privateNotes}
              onChange={(e) => updateStudentProfile(student.id, { privateNotes: e.target.value })}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="cp-btn"
            style={{ color: student.pagoPendiente ? "var(--coral)" : "var(--sage)" }}
            onClick={() => updateStudentProfile(student.id, { pagoPendiente: !student.pagoPendiente })}
          >
            {student.pagoPendiente ? "Pago pendiente — marcar como pagado" : "Pago al día — marcar como pendiente"}
          </button>
          <RecordatorioWhatsApp student={student} />
        </div>
      </div>

      <RepertorioEstudiante student={student} updateStudentProfile={updateStudentProfile} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Calendar size={14} color="var(--sage)" />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Agendar clase</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input className="cp-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="cp-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
            <input type="checkbox" checked={repeatWeekly} onChange={(e) => setRepeatWeekly(e.target.checked)} />
            Repetir cada semana por
            <input
              type="number"
              min={2}
              max={26}
              value={repeatWeeks}
              disabled={!repeatWeekly}
              onChange={(e) => setRepeatWeeks(Number(e.target.value))}
              style={{ width: 44, padding: "2px 4px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)" }}
            />
            semanas
          </label>
          <button
            className="cp-btn cp-btn-primary"
            style={{ width: "100%" }}
            onClick={() => {
              if (!date || !time) return;
              if (repeatWeekly) scheduleRecurringClasses(student.id, date, time, repeatWeeks);
              else scheduleClass(student.id, date, time);
              setDate(""); setTime("");
            }}
          >
            <Repeat size={13} style={{ verticalAlign: -2, marginRight: 4, display: repeatWeekly ? "inline" : "none" }} />
            {repeatWeekly ? `Agendar ${repeatWeeks} clases` : "Agendar"}
          </button>

          <div style={{ marginTop: 16 }}>
            <div className="cp-label" style={{ marginBottom: 6 }}>Próximas clases</div>
            {pendientes.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-light)" }}>No hay clases programadas.</div>}
            {pendientes.map((c) => (
              <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{c.date} · {c.time}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="cp-btn cp-btn-primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setCompletingId(completingId === c.id ? null : c.id)}>
                      Completar y agregar retro
                    </button>
                    <button className="cp-btn" style={{ padding: "4px 8px" }} onClick={() => cancelClass(student.id, c.id)} aria-label="Cancelar clase"><X size={12} /></button>
                  </div>
                </div>
                {completingId === c.id && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    <textarea className="cp-input" placeholder="Retroalimentación" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} />
                    <textarea className="cp-input" placeholder="Tareas para la próxima clase" value={tasks} onChange={(e) => setTasks(e.target.value)} rows={2} />
                    <button
                      className="cp-btn cp-btn-primary"
                      onClick={() => {
                        completeClass(student.id, c.id, feedback, tasks);
                        setCompletingId(null); setFeedback(""); setTasks("");
                      }}
                    >
                      Guardar y descontar 1 crédito
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <ClipboardList size={14} color="var(--sage)" />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Historial</span>
          </div>
          {historial.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-light)" }}>Sin clases completadas todavía.</div>}
          {historial.map((c) => (
            <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  {c.date} · {c.time}
                  {c.status === "ausencia" && (
                    <span style={{ fontSize: 10, fontWeight: 500, color: "var(--coral)", background: "var(--alert-bg)", padding: "1px 6px", borderRadius: 999 }}>Ausencia</span>
                  )}
                </div>
                <button
                  className="cp-btn"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => {
                    if (editingId === c.id) { setEditingId(null); return; }
                    setEditingId(c.id); setEditFeedback(c.feedback || ""); setEditTasks(c.tasks || "");
                  }}
                >
                  {c.feedback || c.tasks ? "Editar" : "Agregar retro"}
                </button>
              </div>
              {editingId === c.id ? (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea className="cp-input" placeholder="Retroalimentación" value={editFeedback} onChange={(e) => setEditFeedback(e.target.value)} rows={2} />
                  <textarea className="cp-input" placeholder="Tareas para la próxima clase" value={editTasks} onChange={(e) => setEditTasks(e.target.value)} rows={2} />
                  <button
                    className="cp-btn cp-btn-primary"
                    onClick={() => { updateClassFeedback(student.id, c.id, editFeedback, editTasks); setEditingId(null); }}
                  >
                    Guardar
                  </button>
                </div>
              ) : (
                <>
                  {c.feedback && <div style={{ marginTop: 4, color: "var(--text-soft)" }}><strong style={{ fontWeight: 500 }}>Retro:</strong> {c.feedback}</div>}
                  {c.tasks && (
                    <div style={{ marginTop: 2, color: "var(--text-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span><strong style={{ fontWeight: 500 }}>Tarea:</strong> {c.tasks}</span>
                      <button
                        className="cp-btn"
                        style={{ padding: "1px 6px", fontSize: 10, color: c.taskReviewed ? "var(--sage)" : "var(--coral)", flexShrink: 0 }}
                        onClick={() => toggleTaskReviewed(student.id, c.id)}
                      >
                        {c.taskReviewed ? "Revisada ✓" : "Marcar revisada"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TicketPunch({ total, remaining }) {
  const dots = Array.from({ length: total });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, background: "var(--soft-bg)", borderRadius: 10, padding: 12, border: "1px dashed var(--line)" }}>
      {dots.map((_, i) => {
        const used = i >= remaining;
        return (
          <div
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: `1.5px solid ${used ? "var(--line)" : "var(--brass-dark)"}`,
              background: used ? "transparent" : "var(--brass)",
            }}
          />
        );
      })}
    </div>
  );
}

function MiTempoHoyEstudiante({ student }) {
  const today = new Date().toISOString().slice(0, 10);
  const claseHoy = student.classes.find((c) => c.status === "programada" && c.date === today);

  const items = [];
  if (student.challengeName) items.push(`${student.challengeName} (Día ${student.challengeDay}/${student.challengeTotal})`);
  if (claseHoy) items.push(`Tienes clase a las ${claseHoy.time}`);
  if (student.materialNote) items.push(`Recuerda llevar ${student.materialNote}`);

  return (
    <div className="cp-card" style={{ background: "var(--panel-dark)", color: "#fff", borderColor: "var(--panel-dark)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600 }}>{saludoHora()}, {student.name}</div>
      <div style={{ fontSize: 12, color: "#a9b8c6", marginTop: 2, marginBottom: 14 }}>Mi Tempo de hoy</div>

      <div className="cp-label" style={{ color: "#a9b8c6", marginBottom: 8 }}>Hoy tienes</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "#c9d3dc" }}>Sin novedades para hoy.</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((t, i) => <li key={i} style={{ fontSize: 13 }}>· {t}</li>)}
        </ul>
      )}

      {student.creditsRemaining <= 2 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #3a4a5c", fontSize: 13, color: "#f0c4b3" }}>
          Tienes {student.creditsRemaining} crédito{student.creditsRemaining === 1 ? "" : "s"} antes de acabar tu ciclo, no olvides renovarlo!
        </div>
      )}
    </div>
  );
}

function RecargaCreditos({ data, student, submitPaymentRequest }) {
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState(student.packageId);
  const [receiptImage, setReceiptImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [sent, setSent] = useState(false);

  const pendiente = (student.paymentRequests || []).find((r) => r.status === "pendiente");
  const pkg = data.packages.find((p) => p.id === packageId);

  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

  const handleReceiptUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError("");
    setReceiptImage(null);

    if (file.size > 15 * 1024 * 1024) {
      setUploadError("Esa foto pesa demasiado. Intenta con otra o toma la foto de nuevo con menos resolución.");
      return;
    }

    setUploading(true);
    try {
      const compressed = await fileToCompressedImage(file, 700, 0.7);
      setReceiptImage(compressed);
    } catch (compressErr) {
      // Si no se pudo procesar/comprimir (formato no compatible, etc.), intentamos usar el archivo tal cual
      try {
        if (file.size > 4 * 1024 * 1024) {
          throw new Error("La foto es muy pesada para subirla sin comprimir.");
        }
        const raw = await readFileAsDataURL(file);
        setReceiptImage(raw);
      } catch (fallbackErr) {
        console.error("Error subiendo comprobante:", compressErr, fallbackErr);
        setUploadError("No se pudo cargar esta foto. Prueba tomar otra foto (evita capturas o formatos raros) e inténtalo de nuevo.");
      }
    } finally {
      setUploading(false);
    }
  };

  if (pendiente) {
    return (
      <div className="cp-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Wallet size={14} color="var(--sage)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Recarga en revisión</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Tu profe está revisando tu comprobante. Tus créditos se actualizarán apenas lo apruebe.</div>
      </div>
    );
  }

  return (
    <div className="cp-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wallet size={14} color="var(--sage)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Recargar créditos</span>
        </div>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {sent ? (
            <div style={{ fontSize: 13, color: "var(--sage)" }}>¡Comprobante enviado! Tu profe lo revisará pronto.</div>
          ) : (
            <>
              <div>
                <div className="cp-label" style={{ marginBottom: 4 }}>Elige tu paquete</div>
                <select className="cp-select" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                  {data.packages.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatCOP(p.price)}</option>)}
                </select>
              </div>

              {data.qrCode && (
                <div>
                  <div className="cp-label" style={{ marginBottom: 4 }}>Escanea y paga</div>
                  <img src={data.qrCode} alt="Código QR de cobro" style={{ width: 130, height: 130, objectFit: "contain", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
                </div>
              )}
              {data.paymentInstructions && (
                <div style={{ fontSize: 12, color: "var(--text-soft)", background: "var(--soft-bg)", borderRadius: 8, padding: 10 }}>{data.paymentInstructions}</div>
              )}

              <div>
                <div className="cp-label" style={{ marginBottom: 4 }}>Sube tu comprobante</div>
                <input type="file" accept="image/*" onChange={handleReceiptUpload} style={{ fontSize: 11 }} />
                {uploading && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Cargando foto…</div>}
                {uploadError && <div style={{ fontSize: 11, color: "var(--coral)", marginTop: 6 }}>{uploadError}</div>}
                {receiptImage && <img src={receiptImage} alt="Comprobante" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, marginTop: 8, border: "1px solid var(--line)" }} />}
              </div>

              <button
                className="cp-btn cp-btn-primary"
                disabled={!receiptImage || uploading}
                onClick={() => {
                  submitPaymentRequest(student.id, packageId, receiptImage);
                  setSent(true);
                  setReceiptImage(null);
                }}
              >
                {uploading ? "Procesando…" : `Enviar comprobante · ${formatCOP(pkg?.price)}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EstudianteView({ data, studentPortalId, setStudentPortalId, submitPaymentRequest, updateStudentProfile, locked }) {
  const student = data.students.find((s) => s.id === studentPortalId);
  const pkg = student ? data.packages.find((p) => p.id === student.packageId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!locked && (
        <div className="cp-card">
          <div className="cp-label" style={{ marginBottom: 8 }}>Simular acceso de estudiante</div>
          <select className="cp-select" value={studentPortalId || ""} onChange={(e) => setStudentPortalId(e.target.value)}>
            <option value="">Selecciona un estudiante</option>
            {data.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {student && (
        <>
          <MiTempoHoyEstudiante student={student} />

          {(data.subjects || []).length > 0 && (
            <div className="cp-card">
              <div className="cp-label" style={{ marginBottom: 6 }}>¿Qué clase ves con tu profe?</div>
              <select
                className="cp-select"
                value={student.subject || ""}
                onChange={(e) => updateStudentProfile(student.id, { subject: e.target.value })}
              >
                <option value="">Selecciona una materia</option>
                {data.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {student.creditsRemaining <= 1 && (
            <div style={{ background: "var(--alert-bg)", border: "1px solid var(--coral)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} color="var(--coral)" />
              <span style={{ fontSize: 13, color: "var(--alert-text)" }}>Se te están acabando los créditos. Recarga con tu profe para seguir tus clases.</span>
            </div>
          )}

          <div className="cp-card">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{pkg?.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Vence: {student.expiry}</div>
            <TicketPunch total={student.creditsTotal} remaining={student.creditsRemaining} />
          </div>

          <RecargaCreditos data={data} student={student} submitPaymentRequest={submitPaymentRequest} />

          <div className="cp-card">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Calendar size={14} color="var(--sage)" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Próximas clases</span>
            </div>
            {student.classes.filter((c) => c.status === "programada").length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted-light)" }}>No tienes clases programadas.</div>
            ) : (
              student.classes.filter((c) => c.status === "programada").map((c) => (
                <div key={c.id} style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--line)" }}>{c.date} · {c.time}</div>
              ))
            )}
          </div>

          <div className="cp-card">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <ClipboardList size={14} color="var(--sage)" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Retroalimentación y tareas</span>
            </div>
            {student.classes.filter((c) => c.status === "completada").length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted-light)" }}>Aún no hay clases completadas.</div>
            ) : (
              student.classes.filter((c) => c.status === "completada").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map((c) => (
                <div key={c.id} style={{ fontSize: 12, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontWeight: 500 }}>{c.date} · {c.time}</div>
                  {c.feedback && <div style={{ marginTop: 3 }}><strong style={{ fontWeight: 500 }}>Retro:</strong> {c.feedback}</div>}
                  {c.tasks && <div style={{ marginTop: 2 }}><strong style={{ fontWeight: 500 }}>Tarea:</strong> {c.tasks}</div>}
                </div>
              ))
            )}
          </div>

          <ConoceATuProfe data={data} />
        </>
      )}
    </div>
  );
}

function ConoceATuProfe({ data }) {
  const p = data.teacherProfile || {};
  const social = p.social || {};
  const hasSocial = social.instagram || social.facebook || social.whatsapp || social.website;
  if (!p.bio && !p.credentials && !hasSocial && !p.contactEmail && !p.contactPhone) return null;

  return (
    <div className="cp-card">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <User size={14} color="var(--sage)" />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Conoce a tu profe</span>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{data.teacherName || "Tu profe"}</div>
      {p.credentials && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{p.credentials}</div>}
      {p.bio && <div style={{ fontSize: 13, marginBottom: 10 }}>{p.bio}</div>}
      {(p.contactEmail || p.contactPhone) && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
          {p.contactEmail && <div>{p.contactEmail}</div>}
          {p.contactPhone && <div>{p.contactPhone}</div>}
        </div>
      )}
      {hasSocial && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {social.instagram && <span style={{ fontSize: 12, background: "var(--soft-bg)", borderRadius: 999, padding: "4px 10px" }}>IG: {social.instagram}</span>}
          {social.facebook && <span style={{ fontSize: 12, background: "var(--soft-bg)", borderRadius: 999, padding: "4px 10px" }}>FB: {social.facebook}</span>}
          {social.whatsapp && <span style={{ fontSize: 12, background: "var(--soft-bg)", borderRadius: 999, padding: "4px 10px" }}>WhatsApp: {social.whatsapp}</span>}
          {social.website && <span style={{ fontSize: 12, background: "var(--soft-bg)", borderRadius: 999, padding: "4px 10px" }}>{social.website}</span>}
        </div>
      )}
    </div>
  );
}
