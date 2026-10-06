import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  GraduationCap, 
  Zap, 
  Database, 
  ShieldCheck, 
  MessageSquare, 
  Lightbulb, 
  CloudUpload, 
  Folder, 
  Calendar, 
  Trash2, 
  Sparkles, 
  Paperclip, 
  Send 
} from 'lucide-react';
import './App.css';

function App() {
  const [courses, setCourses] = useState([]);
  const [activeCourse, setActiveCourse] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);

  // State untuk Materi & Tugas
  const [materiList, setMateriList] = useState([]);
  const [loadingMateri, setLoadingMateri] = useState(false);
  const [uploadJenis, setUploadJenis] = useState('materi');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  // State untuk Live Chat Bot
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);

  // State untuk API Key & Pengaturan
  const [apiKeyConfigured, setApiKeyConfigured] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [inputApiKey, setInputApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [configSuccess, setConfigSuccess] = useState(null);

  // Cek status API Key saat load
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setApiKeyConfigured(data.configured);
        setLoadingConfig(false);
      })
      .catch(err => {
        console.error('Gagal mengecek konfigurasi:', err);
        setLoadingConfig(false);
      });
  }, []);

  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    if (!inputApiKey.trim() || inputApiKey.trim().length < 10) {
      setConfigError('API Key tidak valid atau terlalu pendek.');
      return;
    }

    setSavingKey(true);
    setConfigError(null);
    setConfigSuccess(null);

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: inputApiKey.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan API Key.');
      }

      setConfigSuccess('API Key berhasil disimpan! Memuat ulang aplikasi...');
      setInputApiKey('');
      setApiKeyConfigured(true);
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setSavingKey(false);
    }
  };

  // Ambil data courses saat load (jika sudah configured)
  useEffect(() => {
    if (apiKeyConfigured) {
      fetch('/api/courses')
        .then(res => res.json())
        .then(data => {
          setCourses(data);
          if (data.length > 0) {
            setActiveCourse(data[0]);
          }
          setLoadingCourses(false);
        })
        .catch(err => {
          console.error('Gagal memuat mata kuliah:', err);
          setLoadingCourses(false);
        });
    }
  }, [apiKeyConfigured]);

  // Ambil materi & chat history saat activeCourse berubah
  useEffect(() => {
    if (activeCourse) {
      fetchMateri(activeCourse.name);
      fetchChatHistory(activeCourse.name);
      setUploadError(null);
      setUploadSuccess(null);
      setChatError(null);
    }
  }, [activeCourse]);

  // Auto scroll chat ke bawah
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  const fetchMateri = async (courseName) => {
    setLoadingMateri(true);
    try {
      const res = await fetch(`/api/materi?mata_kuliah=${encodeURIComponent(courseName)}`);
      const data = await res.json();
      if (res.ok) {
        setMateriList(data);
      }
    } catch (err) {
      console.error('Gagal mengambil daftar materi:', err);
    } finally {
      setLoadingMateri(false);
    }
  };

  const fetchChatHistory = async (courseName) => {
    try {
      const res = await fetch(`/api/chat?mata_kuliah=${encodeURIComponent(courseName)}`);
      const data = await res.json();
      if (res.ok) {
        setChatMessages(data);
      }
    } catch (err) {
      console.error('Gagal memuat riwayat chat:', err);
    }
  };

  const handleUploadMateri = async (e) => {
    e.preventDefault();
    if (!selectedFile || !activeCourse) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('mata_kuliah', activeCourse.name);
    formData.append('jenis', uploadJenis);

    try {
      const res = await fetch('/api/materi/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengunggah file.');
      }

      setUploadSuccess(`Berhasil mengunggah "${data.nama_file}" (${data.jumlah_karakter.toLocaleString()} karakter).`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      fetchMateri(activeCourse.name);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMateri = async (id, fileName) => {
    if (!window.confirm(`Yakin ingin menghapus "${fileName}"?`)) return;

    try {
      const res = await fetch(`/api/materi/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal menghapus materi.');
      }

      fetchMateri(activeCourse.name);
    } catch (err) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeCourse || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatError(null);
    setChatLoading(true);

    // Optimistic UI update
    const tempUserMsg = { id: Date.now(), role: 'user', content: userMessage, created_at: new Date().toISOString() };
    setChatMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mata_kuliah: activeCourse.name,
          message: userMessage
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim pesan ke AI.');
      }

      await fetchChatHistory(activeCourse.name);
    } catch (err) {
      setChatError(err.message);
    } finally {
      setChatLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm('Yakin ingin menghapus seluruh riwayat chat mata kuliah ini?')) return;

    try {
      const res = await fetch(`/api/chat?mata_kuliah=${encodeURIComponent(activeCourse.name)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setChatMessages([]);
      }
    } catch (err) {
      alert('Gagal membersihkan chat');
    }
  };

  // Helper mapping ikon tab
  const getCourseIcon = (name) => {
    if (name.includes('Basis Data')) return <Database size={20} />;
    if (name.includes('Manajemen Resiko')) return <ShieldCheck size={20} />;
    if (name.includes('Komunikasi Bisnis')) return <MessageSquare size={20} />;
    return <Lightbulb size={20} />;
  };

  return (
    <div className="app-container">
      {/* BAGIAN 1: HEADER */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-icon-wrapper">
            <GraduationCap size={28} color="#FFFFFF" />
          </div>
          <div className="header-title-area">
            <h1>Asisten <span>Belajar</span> Mahasiswa</h1>
            <p>Pusat belajar mandiri untuk kuliah, tugas, dan persiapan masa depan.</p>
          </div>
        </div>

        {apiKeyConfigured && (
          <button
            onClick={() => setApiKeyConfigured(false)}
            className="btn-delete"
            style={{ padding: '8px 14px', fontSize: '13px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60A5FA' }}
          >
            Pengaturan API Key
          </button>
        )}
      </header>

      {loadingConfig ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#A5B0C8' }}>Memuat konfigurasi...</div>
      ) : !apiKeyConfigured ? (
        <div className="glass-card" style={{ maxWidth: '600px', margin: '40px auto', width: '100%' }}>
          <div className="course-hero" style={{ marginBottom: '24px' }}>
            <div className="course-hero-icon" style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)' }}>
              <Sparkles size={24} />
            </div>
            <div className="course-hero-content">
              <h2>Konfigurasi Gemini API Key</h2>
              <p>
                Aplikasi ini membutuhkan Google Gemini API Key agar fitur asisten AI, tanya jawab, dan analisis dokumen dapat berfungsi. Key Anda disimpan secara lokal dan aman di perangkat ini.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveApiKey}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px', color: '#CBD5E1', fontWeight: '500' }}>
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={inputApiKey}
                  onChange={(e) => setInputApiKey(e.target.value)}
                  placeholder="Masukkan API Key (contoh: AIzaSy...)"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#F8FAFC',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  disabled={savingKey}
                />
              </div>

              {configError && (
                <div className="alert-box alert-error">
                  <strong>Gagal:</strong> {configError}
                </div>
              )}

              {configSuccess && (
                <div className="alert-box alert-success">
                  <strong>Sukses:</strong> {configSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={savingKey || !inputApiKey.trim()}
                className="btn-gradient"
                style={{ width: '100%', justifyContent: 'center', padding: '14px', marginTop: '8px' }}
              >
                {savingKey ? 'Menyimpan...' : 'Simpan API Key & Lanjutkan'}
              </button>
            </div>
          </form>
        </div>
      ) : loadingCourses ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#A5B0C8' }}>Memuat mata kuliah...</div>
      ) : (
        <>
          {/* BAGIAN 2: TAB MATA KULIAH */}
          <div className="tabs-wrapper">
            {courses.map(course => {
              const isActive = activeCourse?.id === course.id;
              return (
                <button
                  key={course.id}
                  onClick={() => setActiveCourse(course)}
                  className={`tab-btn ${isActive ? 'active' : ''}`}
                >
                  {getCourseIcon(course.name)}
                  <span>{course.name}</span>
                </button>
              );
            })}
          </div>

          {/* BAGIAN 3: KARTU MATA KULIAH AKTIF & UPLOAD */}
          {activeCourse && (
            <div className="glass-card">
              <div className="course-hero">
                <div className="course-hero-icon">
                  {getCourseIcon(activeCourse.name)}
                </div>
                <div className="course-hero-content">
                  <h2>{activeCourse.name}</h2>
                  <p>
                    Selamat datang di ruang belajar mata kuliah <strong>{activeCourse.name}</strong>. Di sini kamu dapat mengelola materi, ringkasan, dan bertanya langsung kepada Gemini AI untuk mendalami materi perkuliahan maupun persiapan tugas.
                  </p>
                </div>
              </div>

              <div className="divider"></div>

              {/* Area Upload */}
              <div className="upload-box">
                <div className="upload-header">
                  <CloudUpload size={22} color="#3B82F6" />
                  <span>Upload Materi & Tugas (.pdf, .docx)</span>
                </div>
                <div className="upload-sub">
                  Jenis Dokumen: Materi Kuliah | Pilih File (.pdf / .docx, Max 10MB)
                </div>

                <form onSubmit={handleUploadMateri}>
                  <div className="upload-controls">
                    <select
                      value={uploadJenis}
                      onChange={(e) => setUploadJenis(e.target.value)}
                      className="upload-select"
                    >
                      <option value="materi">Materi Kuliah</option>
                      <option value="tugas">Tugas / Dokumen Pendukung</option>
                    </select>

                    <div 
                      className="file-input-wrapper"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={16} color="#94A3B8" />
                      <span style={{ fontSize: '14px', color: selectedFile ? '#F8FAFC' : '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedFile ? selectedFile.name : 'Tidak ada file yang dipilih'}
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx"
                        onChange={(e) => setSelectedFile(e.target.files[0])}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={uploading || !selectedFile}
                      className="btn-gradient"
                    >
                      <CloudUpload size={16} />
                      {uploading ? 'Mengunggah...' : 'Upload File'}
                    </button>
                  </div>
                </form>

                {uploadError && (
                  <div className="alert-box alert-error">
                    <strong>Gagal:</strong> {uploadError}
                  </div>
                )}

                {uploadSuccess && (
                  <div className="alert-box alert-success">
                    <strong>Sukses:</strong> {uploadSuccess}
                  </div>
                )}
              </div>

              {/* Daftar Dokumen Tersimpan */}
              <div className="doc-list-section">
                <h4>
                  <Folder size={18} color="#F59E0B" />
                  Daftar Materi & Tugas Tersimpan ({materiList.length})
                </h4>

                {loadingMateri ? (
                  <p style={{ fontSize: '14px', color: '#A5B0C8' }}>Memuat daftar materi...</p>
                ) : materiList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', color: '#94A3B8', fontSize: '14px' }}>
                    Belum ada materi. Upload PDF atau Word untuk mulai.
                  </div>
                ) : (
                  <div className="doc-items">
                    {materiList.map(item => {
                      const isPdf = item.nama_file.toLowerCase().endsWith('.pdf');
                      return (
                        <div key={item.id} className="doc-item">
                          <div className="doc-item-left">
                            <div className={`file-type-badge ${isPdf ? 'file-type-pdf' : 'file-type-doc'}`}>
                              {isPdf ? 'PDF' : 'DOC'}
                            </div>
                            <div className="doc-info">
                              <h5>
                                {item.nama_file}
                                <span className="doc-badge-type">{item.jenis}</span>
                              </h5>
                              <div className="doc-meta">
                                <Calendar size={13} />
                                Jumlah Karakter: {item.jumlah_karakter.toLocaleString()} | Diunggah: {new Date(item.dibuat_pada).toLocaleString('id-ID')}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteMateri(item.id, item.nama_file)}
                            className="btn-delete"
                          >
                            <Trash2 size={14} />
                            Hapus
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BAGIAN 4: KARTU CHAT */}
          <div className="chat-card">
            <div className="chat-header">
              <div className="chat-title-wrapper">
                <div className="chat-sparkle-icon">
                  <Sparkles size={24} />
                </div>
                <div className="chat-title-area">
                  <h3>Live <span>Chat</span> Asisten Belajar AI</h3>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {chatMessages.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    className="btn-delete"
                    style={{ padding: '8px 14px', fontSize: '13px' }}
                    title="Hapus seluruh riwayat percakapan"
                  >
                    <Trash2 size={14} />
                    Hapus Percakapan
                  </button>
                )}
                <div className="gemini-badge">
                  <div className="pulse-dot"></div>
                  <Sparkles size={14} />
                  Berbasis Gemini AI
                </div>
              </div>
            </div>

            <p className="chat-desc">
              Tanya jawab interaktif seputar materi dan tugas yang sudah di-upload. AI akan otomatis membaca seluruh dokumen di atas sebagai konteks.
            </p>

            <div ref={chatScrollRef} className="chat-messages-container">
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748B', margin: 'auto', fontStyle: 'italic', fontSize: '15px' }}>
                  Belum ada percakapan. Mulai tanyakan sesuatu mengenai mata kuliah <strong style={{ color: '#A5B0C8' }}>{activeCourse?.name}</strong>!
                </div>
              ) : (
                chatMessages.map((msg, index) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div 
                      key={msg.id || index}
                      className={`chat-bubble ${isUser ? 'user' : 'model'}`}
                    >
                      <div className="chat-sender-name">
                        {isUser ? 'Anda' : 'Asisten AI'}
                      </div>
                      {isUser ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      ) : (
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            li: ({ children, ...props }) => {
                              // Cek apakah item list diawali pola opsi jawaban (A., B., C., D., E.)
                              const textContent = Array.isArray(children) 
                                ? children.map(c => typeof c === 'string' ? c : (c?.props?.children || '')).join('') 
                                : (typeof children === 'string' ? children : '');
                              
                              const isOption = /^\s*[A-Ea-e][.)]\s/.test(textContent);
                              return (
                                <li className={isOption ? 'opsi-jawaban' : ''} {...props}>
                                  {children}
                                </li>
                              );
                            }
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  );
                })
              )}

              {chatLoading && (
                <div className="chat-bubble model" style={{ fontStyle: 'italic', color: '#94A3B8' }}>
                  Asisten AI sedang mengetik...
                </div>
              )}
            </div>

            {chatError && (
              <div className="alert-box alert-error" style={{ marginBottom: '16px' }}>
                <strong>Error:</strong> {chatError}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="chat-input-form">
              <div className="chat-input-wrapper">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-paperclip"
                  title="Upload Dokumen Cepat"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ketik pertanyaan atau minta rangkuman materi..."
                  className="chat-input"
                  disabled={chatLoading}
                />
              </div>
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="btn-gradient"
                style={{ padding: '14px 24px', height: '52px' }}
              >
                <Send size={18} />
                Kirim
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
