// server.js


import express from "express";
import cors from "cors";
import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = "https://xyaenmrwpwbrwxbgmwck.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5YWVubXJ3cHdicnd4Ymdtd2NrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjIyNDE5OCwiZXhwIjoyMDc3ODAwMTk4fQ.POW348vVbLrmZcJEpS2IWEmT1F1wwSELFqz7V2uq8H8";

const GOOGLE_CLIENT_ID =
  "88444590813-lbupe3tkp7t9gg0hqme2snoo200ogt6n.apps.googleusercontent.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const upload = multer();


app.use(express.static(path.join(__dirname, "public")));
/* -------------------------- Auth -------------------------- */

/* -------------------------- Google Auth -------------------------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Home.html"));
});

app.post("/auth/google", async (req, res) => {
  try {
    const { id_token, mode } = req.body;

    if (!id_token) {
      return res.status(400).json({
        success: false,
        message: "Missing ID token",
      });
    }

    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;

    // Check user exists?
    const { data: existingUser, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (findError) {
      console.log("check user error:", findError);
      return res
        .status(500)
        .json({ success: false, message: "Database error" });
    }

    /* ---------------------- Mode: Sign-in ---------------------- */
    if (mode === "signin") {
      if (!existingUser) {
        return res.json({
          success: true,
          status: "not_registered",
          email, 
          name,
        });
      }

      return res.json({
        success: true,
        status: "existing_user",
        id: existingUser.id,
        email,
        name,
      });
    }

    /* ---------------------- Mode: Register ---------------------- */
    if (mode === "register") {
      if (existingUser) {
        return res.json({
          success: true,
          status: "already_registered",
          id: existingUser.id,
          email,
          name,
        });
      }

      // Create new user
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert([{ email, name }])
        .select()
        .single();

      if (insertError) {
        console.log("create user error:", insertError);
        return res
          .status(500)
          .json({ success: false, message: "Register failed" });
      }

      return res.json({
        success: true,
        status: "new_user",
        id: newUser.id,
        email,
        name,
      });
    }

    return res
      .status(400)
      .json({ success: false, message: "Invalid mode" });

  } catch (err) {
    console.log("Google login error:", err);
    return res
      .status(500)
      .json({ success: false, message: err.message });
  }
});


/* -------------------------- Register (manual) -------------------------- */
app.post("/register", async (req, res) => {
  try {
    let { email, name } = req.body;

    console.log("📥 REGISTER INPUT:", { email, name });

    // ✅ กัน undefined 100%
    if (!email || email === "undefined") {
      return res.status(400).json({
        success: false,
        message: "❌ ไม่พบ email จากระบบ (email is missing)"
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "❌ ไม่พบ name"
      });
    }

    // ✅ เช็คชื่อซ้ำ (ของเดิมคุณ)
    const { data: duplicateName, error: dupErr } = await supabase
      .from("users")
      .select("*")
      .eq("name", name)
      .maybeSingle();

    if (dupErr) throw dupErr;

    if (duplicateName) {
      return res.json({
        success: false,
        message: "ชื่อนี้ถูกใช้แล้ว",
      });
    }

    // ✅ Insert แบบปลอดภัย (ของเดิมคุณ)
    const { data: newUser, error: insertErr } = await supabase
      .from("users")
      .insert([
        { 
          email: String(email).trim(),
          name: String(name).trim()
        }
      ])
      .select()
      .single();

    if (insertErr) throw insertErr;

    // ✅ ส่ง user object กลับไปครบ (จุดสำคัญ)
    res.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
      }
    });

  } catch (err) {
    console.error("❌ REGISTER ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});




/* -------------------------- Get User -------------------------- */

app.get("/getUser", async (req, res) => {
  const { email } = req.query;

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id,name,email,created_at,profile_image")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json(user);

  } catch (err) {
    res.status(500).json({
      message: "Server error",
    });
  }
});
/* ----------------- Upload Profile Image ----------------- */
app.post("/upload/profile-image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: "Missing userId" });
    }

    const fileExt = req.file.originalname.split(".").pop();
    const filePath = `profile/${userId}.${fileExt}`;

    // อัปโหลดไฟล์ไป Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from("profile-images")
      .upload(filePath, req.file.buffer, {
        upsert: true,
        contentType: req.file.mimetype,
      });

    if (storageError) throw storageError;

    const rawImageUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-images/${filePath}`;

    // update users table
    const { data: userData, error: userError } = await supabase
      .from("users")
      .update({ profile_image: rawImageUrl })
      .eq("id", userId)
      .select("*") // ✅ คืนข้อมูล user ล่าสุด
      .single();

    if (userError) throw userError;

    // เพิ่ม cache-busting query string
    const profileImageUrl = `${userData.profile_image}?v=${Date.now()}`;

    // ส่งกลับ profile_image ล่าสุดจาก DB พร้อม URL ใหม่
    res.json({ success: true, profile_image: profileImageUrl, data: userData });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


/* -------------------------- Payment Upload -------------------------- */

app.post("/payment/upload",
  
  upload.fields([
    { name: "slip", maxCount: 1 },
    { name: "evidence", maxCount: 1 },
    { name: "artwork_file", maxCount: 1 },
  ]),
  async (req, res) => {
        console.log("===== /payment/upload called =====");
    console.log("req.body:", req.body);
    console.log("req.files:", req.files);
    try {
      const body = req.body || {};
      const user_id = body.user_id;
      const artwork_name = body.artwork_name || null;
      const artwork_type = body.artwork_type || null;
      const artworkDetail = body.artworkDetail || null;
      const concept = body.concept || null;
      const fee = Number(body.fee || 0);

      const fileSlip = req.files?.slip?.[0] || null;
      const fileArtwork = req.files?.artwork_file?.[0] || null;
      const fileEvidence = req.files?.evidence?.[0] || null;

      if (!user_id)
        return res.status(400).json({ success: false, message: "Missing user_id" });

      if (!concept)
        return res.status(400).json({ success: false, message: "Missing concept" });

      if (!fileSlip)
        return res.status(400).json({ success: false, message: "Missing slip file" });

      /* ======================================================
         ✅ 1) เช็คสมัครซ้ำ (USER + CONCEPT)
      ====================================================== */
      const { data: duplicate } = await supabase
        .from("Payments")
        .select("id")
        .eq("user_id", user_id)
        .eq("concept", concept)
        .limit(1);

      if (duplicate && duplicate.length > 0) {
        return res.json({
          success: false,
          isDuplicate: true,
          message: "1 User สมัครได้ 1 ครั้งต่อ 1 Concept เท่านั้น"
        });
      }

      /* ======================================================
         ✅ 2) upload slip
      ====================================================== */
      const slipPath = `slips/${user_id}_${Date.now()}_${fileSlip.originalname}`;
      await supabase.storage.from("slips").upload(slipPath, fileSlip.buffer, {
        upsert: false,
        contentType: fileSlip.mimetype,
      });
      const slipUrl = supabase.storage.from("slips").getPublicUrl(slipPath).data.publicUrl;

      /* ======================================================
         ✅ 3) upload artwork
      ====================================================== */
      let artworkUrl = null;
      if (fileArtwork) {
        const artworkPath = `artworks/${user_id}_${Date.now()}_${fileArtwork.originalname}`;
        await supabase.storage.from("artworks").upload(artworkPath, fileArtwork.buffer, {
          upsert: false,
          contentType: fileArtwork.mimetype,
        });
        artworkUrl = supabase.storage.from("artworks").getPublicUrl(artworkPath).data.publicUrl;
      }

      /* ======================================================
         ✅ 4) upload evidence
      ====================================================== */
      let evidenceUrl = null;
      if (fileEvidence) {
        const evPath = `evidence/${user_id}_${Date.now()}_${fileEvidence.originalname}`;
        await supabase.storage.from("evidence").upload(evPath, fileEvidence.buffer, {
          upsert: false,
          contentType: fileEvidence.mimetype,
        });
        evidenceUrl = supabase.storage.from("evidence").getPublicUrl(evPath).data.publicUrl;
      }

      /* ======================================================
         ✅ 5) insert payment
      ====================================================== */
      const payload = {
        user_id,
        slip_url: slipUrl,
        artwork_name,
        artwork_type,
        artwork_url: artworkUrl,
        evidence_url: evidenceUrl,
        concept,
        fee,
        confirmed: false,
        approved: false,
        artworkDetail,
        status: "pending",
        created_at: new Date().toISOString()
      };

      const { data: payment, error } = await supabase
        .from("Payments")
        .insert([payload])
        .select()
        .single();

      if (error)
        return res.status(500).json({ success: false, message: error.message });

      /* ====================================================== 
         ✅ ❌ 6) (ถูกลบออกแล้ว) ไม่เพิ่ม contestants_count อีกต่อไป
         ❌ โค้ดเดิมถูกลบตรงนี้ทั้งหมด
      ====================================================== */

      /* ======================================================
         ✅ 7) ส่งผลลัพธ์กลับ
      ====================================================== */
      res.json({
        success: true,
        message: "created",
        paymentId: payment.id,
        payment
      });

    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);


/* -------------------------- Confirm -------------------------- */

app.post("/payment/confirm", async (req, res) => {
  const { payment_id } = req.body;

  const { data, error } = await supabase
    .from("Payments")
    .update({ confirmed: true, confirmed_at: new Date().toISOString() })
    .eq("id", payment_id)
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, message: error });

  res.json({ success: true, data });
});

/* -------------------------- Admin List -------------------------- */

/*app.get("/admin/pendingPayments", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Payments")
      .select(
        `
          id,
          user_id,
          slip_url,
          artwork_url,
          evidence_url,
          artwork_name,
          artwork_type,
          confirmed,
          confirmed_at,
          approved,
          approved_at,
          created_at,
          failed_reason, 
          users:users!inner(id,name,email)
        `
      )
      .order("created_at", { ascending: false });

    if (error)
      return res.status(500).json({ success: false, message: error.message });

    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});*/

app.get("/admin/pendingPayments", async (req, res) => {
  try {
    // ดึง payments (fields ตาม schema ของคุณ)
    const { data, error } = await supabase
      .from("Payments")
      .select(`
        id,
        user_id,
        slip_url,
        artwork_name,
        artwork_type,
        artwork_url,
        evidence_url,
        confirmed,
        confirmed_at,
        approved,
        approved_at,
        status,
        failed_step,
        failed_reason,
        failed_image,
        failed_history,
        created_at,
        concept, 
        fee,
        users:users!inner(id,name,email)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // สำหรับแต่ละ payment ให้เช็คว่ามี payment_failures (role != 'admin') หรือไม่
    const enriched = await Promise.all(data.map(async (p) => {
      try {
        const { data: threads, error: tErr } = await supabase
          .from("payment_failures")
          .select("id, role, message, attachments, created_at")
          .eq("payment_id", p.id)
          .order("created_at", { ascending: false });

        if (tErr) {
          // ถ้า error การเช็ค thread ไม่ให้หยุดทั้ง request — แค่ log และ set false
          console.error("thread fetch error for", p.id, tErr);
          p.has_artist_responses = false;
          p.latest_artist = null;
          return p;
        }

        // มี thread ที่ role !== 'admin' (artist/user) ถ้าเจอให้เป็น true
        const artistThreads = (threads || []).filter(t => t.role && t.role !== 'admin');
        p.has_artist_responses = artistThreads.length > 0;

        if (artistThreads.length > 0) {
          // เก็บ message และ attachments จาก thread แรก (ล่าสุด) เพื่อ preview ถ้าต้องการ
          p.latest_artist = {
            message: artistThreads[0].message,
            attachments: (() => {
              try { return Array.isArray(artistThreads[0].attachments) ? artistThreads[0].attachments : JSON.parse(artistThreads[0].attachments || "[]"); }
              catch(e){ return []; }
            })(),
            created_at: artistThreads[0].created_at
          };
        } else {
          p.latest_artist = null;
        }

        return p;
      } catch (e) {
        console.error("enrich error", e);
        p.has_artist_responses = false;
        p.latest_artist = null;
        return p;
      }
    }));

    return res.json(enriched);
  } catch (err) {
    console.error("pendingPayments error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* -------------------------- Admin Approve -------------------------- */


/* -------------------------- Check Status -------------------------- */

app.get("/checkPaymentStatus", async (req, res) => {
  try {
    const payment_id = req.query.payment_id;

    const { data, error } = await supabase
      .from("Payments")
      .select("id,approved,approved_at")
      .eq("id", payment_id)
      .maybeSingle();

    if (error)
      return res.status(500).json({ success: false, message: error.message });

    const approved = !!(data && data.approved);

    res.json({ success: true, approved, payment: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/user/payments", async (req, res) => {
  try {
    const user_id = req.query.user_id;

    if (!user_id) {
      return res.status(400).json({ success: false, message: "Missing user_id" });
    }

    // 1) ดึง Payments (ของเดิมคุณ 100%)
    const { data: payments, error } = await supabase
      .from("Payments")
      .select(`
        id,
        user_id,
        artwork_name,
        artwork_type,
        artwork_url,
        confirmed_at,
        card_votes,
        status,
        failed_reason,
        approved,
        approved_at,
        concept
      `)
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("payments fetch error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }

    // 🔐 กันพัง: ถ้าไม่มี payment
    if (!payments || payments.length === 0) {
      return res.json([]);
    }

    // 2) เตรียม concept ที่ไม่เป็น null
    const concepts = payments
      .map(p => p.concept)
      .filter(c => !!c);

    // 3) โหลด boards เฉพาะตอนมี concept จริง ๆ
    let boardsMap = {};

    if (concepts.length > 0) {
      const { data: boards, error: bErr } = await supabase
        .from("boards")
        .select("concept, fee, vote_from, vote_to, result_date")
        .in("concept", concepts);

      if (bErr) {
        console.error("boards fetch error:", bErr);
      }

      (boards || []).forEach(b => {
        boardsMap[b.concept] = b;
      });
    }

    // 4) enrich threads + boards (logic เดิมคุณ)
    const enriched = await Promise.all(
      payments.map(async (p) => {

        const { data: threads, error: tErr } = await supabase
          .from("payment_failures")
          .select("id, role, created_at")
          .eq("payment_id", p.id)
          .order("created_at", { ascending: false });

        if (tErr) {
          console.error("payment_failures fetch error:", tErr);
        }

        const lastThread = threads && threads.length ? threads[0] : null;
        const userThreads = (threads || []).filter(t => t.role === "user");
        const board = boardsMap[p.concept] || {};

        return {
          ...p,

          // ✅ เพิ่ม fields (ใหม่)
          fee: board.fee ?? null,
          vote_from: board.vote_from ?? null,
          vote_to: board.vote_to ?? null,
          result_date: board.result_date ?? null,

          // ✅ logic เดิมคุณ
          last_thread_role: lastThread ? lastThread.role : null,
          user_response_count: userThreads.length
        };
      })
    );

    return res.json(enriched);

  } catch (err) {
    console.error("user/payments exception:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});


// === เพิ่ม dependencies ถ้าจำเป็น (คุณมี multer แล้ว) ===
// uploadFailures: รับไฟล์ attachments (สูงสุด 10) จาก user
app.post("/user/failure/respond", upload.array("attachments", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const payment_id = body.payment_id;
    const user_id = body.user_id || null;
    const message = body.message || "";

    if (!payment_id) {
      return res.status(400).json({ success: false, message: "Missing payment_id" });
    }

    // 1) อัปโหลดไฟล์แนบ
    const files = req.files || [];
    const uploadedUrls = [];

    for (const f of files) {
      const path = `failures/${payment_id}_${Date.now()}_${f.originalname}`;

      const { error: upErr } = await supabase.storage
        .from("failures")
        .upload(path, f.buffer, {
          upsert: false,
          contentType: f.mimetype,
        });

      if (upErr) {
        console.error("failure file upload error:", upErr);
        continue;
      }

      let publicUrl;
      try {
        const pr = supabase.storage.from("failures").getPublicUrl(path);
        publicUrl =
          pr?.data?.publicUrl ||
          pr?.publicUrl ||
          `${SUPABASE_URL}/storage/v1/object/public/failures/${encodeURIComponent(
            path.replace(/^failures\//, "")
          )}`;
      } catch (e) {
        publicUrl = `${SUPABASE_URL}/storage/v1/object/public/failures/${encodeURIComponent(
          path.replace(/^failures\//, "")
        )}`;
      }

      uploadedUrls.push(publicUrl);
    }

    // 2) insert user response into payment_failures
    const { data: ins, error: insErr } = await supabase
      .from("payment_failures")
      .insert([{
        payment_id,
        user_id,
        role: "user",
        message,
        attachments: JSON.stringify(uploadedUrls),
      }])
      .select()
      .single();

    if (insErr) {
      console.error("insert failure thread error:", insErr);
      return res.status(500).json({ success: false, message: insErr.message });
    }

    // 3) update Payments
    // - คงสถานะ failed
    // - บังคับ updated_at เพื่อให้ admin เห็นว่า user ตอบแล้ว
    await supabase
      .from("Payments")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment_id);

    return res.json({ success: true, record: ins });

  } catch (err) {
    console.error("user/failure/respond exception:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});



// === Admin marks Failed (initial) with reason ===
app.post("/admin/fail/:id", async (req, res) => {
  try {
    const paymentId = req.params.id;
    const { reason, admin_id } = req.body;
    if (!paymentId) {
      return res.status(400).json({ success: false, message: "Missing payment id" });
    }

    // 1) update status + failed_reason
    const { data: pData, error: pErr } = await supabase
      .from("Payments")
      .update({
        status: 'failed',
        failed_reason: reason
      })
      .eq("id", paymentId)
      .select()
      .single();

    if (pErr) {
      console.error("update payments error:", pErr);
      return res.status(500).json({ success: false, message: pErr.message });
    }

    // 2) insert into failure thread
    const { data: ins, error: insErr } = await supabase
      .from("payment_failures")
      .insert([{
        payment_id: paymentId,
        user_id: pData.user_id || null,
        role: "admin",
        message: reason || "No reason",
        attachments: JSON.stringify([]),
      }])
      .select()
      .single();

    if (insErr) {
      console.error("insert failure thread error:", insErr);
      return res.status(500).json({ success: false, message: insErr.message });
    }

    return res.json({ success: true, failure: ins });

  } catch (err) {
    console.error("admin/fail exception:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// === Admin: get failure threads for a payment (paginated) ===
app.get("/admin/failure/:payment_id", async (req, res) => {
  try {
    const payment_id = req.params.payment_id;
    if (!payment_id) return res.status(400).json({ success: false, message: "Missing payment_id" });

    // fetch threads ordered newest first
    const { data, error } = await supabase
      .from("payment_failures")
      .select("*")
      .eq("payment_id", payment_id)
      .order("created_at", { ascending: false }) // newest first
      .limit(50);

    if (error) return res.status(500).json({ success: false, message: error.message });

    return res.json({ success: true, threads: data });
  } catch (err) {
    console.error("admin failure fetch error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
  
});
app.get("/payment/list", (req, res) => {
    const sorted = payments.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
    res.json(sorted);
});
app.post('/admin/fail/:id', async (req,res) => {
  const { reason } = req.body;
  const { id } = req.params;

  // update payment
  await db.query('UPDATE payments SET status=$1, fail_reason=$2 WHERE id=$3', ['failed', reason, id]);

  res.json({ success: true });
});

app.get('/admin/failure/:id', async (req,res) => {
  const { id } = req.params;
  const { rows } = await db.query('SELECT * FROM failure_threads WHERE payment_id=$1 ORDER BY created_at DESC', [id]);
  res.json({ success:true, threads: rows });
});
// รับข้อมูลเพิ่มเติมจาก artist หลัง admin fail
// 1) upload background file -> returns public url
// Require uuid if you want server-side uuid: const { v4: uuidv4 } = require('uuid');

app.post("/admin/board/uploadBackground", upload.single("background"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const file = req.file;
        const ext = file.originalname.split(".").pop();
        const fileName = `bg_${Date.now()}.${ext}`;

        // Upload file to Supabase Storage
        const { data, error } = await supabase.storage
            .from("board-bg")
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            console.log(error);
            return res.status(500).json({ success: false, message: "Upload failed" });
        }

        const publicUrl = supabase.storage
            .from("board-bg")
            .getPublicUrl(fileName).data.publicUrl;

        return res.json({
            success: true,
            url: publicUrl
        });
    } catch (err) {
        console.error("uploadBackground error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});



// 2) create board
app.post("/admin/board/create", async (req, res) => {
    try {
        const {
            concept,
            fee,
            prize,
            contestants_count,
            open_from,
            open_to,
            vote_from,
            vote_to,
            result_date,
            bg_url,
            open_vote 
        } = req.body;

        const { data, error } = await supabase
            .from("boards")
            .insert({
                concept,
                fee,
                prize,
                contestants_count,
                open_from,
                open_to,
                vote_from,
                vote_to,
                result_date,
                bg_url: bg_url,
                open_vote: false,
                board_state: "payment",
            })
            .select();

        if (error) {
            console.error(error);
            return res.status(400).json({ success: false, error });
        }

        res.json({ success: true, board: data[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});



// 3) optional: list boards for Home
app.get('/boards/list', async (req, res) => {
  try {
    const q = req.query.open_vote;     // true / false
    const state = req.query.board_state; // payment / open_vote / result (เผื่อใช้)

    let qb = supabase
      .from('boards')
      .select('*')
      .order('created_at', { ascending: false });

    // ✅ เงื่อนไขเดิมของคุณ (ไม่ถูกกระทบ)
    if (q === 'true') {
      qb = qb.eq('open_vote', true);
    } 
    else if (q === 'false') {
      qb = qb.eq('open_vote', false);
    }

    // ✅ เพิ่มการกรองตาม board_state แบบไม่บังคับ (ของใหม่)
    if (state) {
      qb = qb.eq('board_state', state);
    }

    const { data, error } = await qb;

    if (error) throw error;

    res.json({
      success: true,
      boards: data
    });

  } catch (err) {
    console.error("boards/list error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});



app.delete('/admin/board/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success:false, message:'Missing id' });

    // หา board ก่อน
    const { data: found, error: fErr } = await supabase.from('boards').select('id, background_url').eq('id', id).single();
    if (fErr) {
      if (fErr.code === 'PGRST116' || fErr.code === 'PGRST102') { /* not found */ }
      // but continue
    }

    // ถ้ามี background_url -> ลบไฟล์จาก storage (ถ้าคุณเก็บ path แทน url ให้ลบ path)
    if (found && found.background_url) {
      try {
        // ถ้า background_url เป็น public URL ของ storage จะต้องแปลงเป็น path ที่ถูกต้อง
        // ถ้าคุณเมื่ออัปโหลดเก็บ path instead of url ให้นำ path ตรงนี้มาลบโดยตรง
        // Example: if you stored "boards/backgrounds/163..." as path, use that.
        // Here we assume background_url contains public URL; we attempt to extract object path after /object/public/boards/
        const url = found.background_url;
        const marker = '/object/public/';
        let bucketAndPath = null;
        if (url.includes(marker)) {
          bucketAndPath = url.split(marker)[1]; // e.g. "boards/boards/backgrounds/xxx.jpg"
          // remove leading bucket folder duplication if any
        }
        // If you stored path on insert (recommended) you can directly call:
        // await supabase.storage.from('boards').remove([path]);
        // We'll attempt safe approach: if you saved path in DB (background_url holding path), use that:
        if (found.background_url && found.background_url.startsWith('boards/')) {
          await supabase.storage.from('boards').remove([found.background_url]);
        } else if (bucketAndPath) {
          // bucketAndPath might be "boards/..." -> remove that
          await supabase.storage.from('boards').remove([bucketAndPath]);
        }
      } catch (e) {
        console.error('warning: remove background failed', e);
      }
    }

    // Delete DB row
    const { data: del, error: delErr } = await supabase.from('boards').delete().eq('id', id);
    if (delErr) throw delErr;

    return res.json({ success:true });
  } catch (err) {
    console.error('delete board err', err);
    res.status(500).json({ success:false, message: err.message });
  }
});
app.post('/admin/createBoard', upload.single("bg"), async (req, res) => {
  try {
    const file = req.file;
    let bg_url = null;

    if (file) {
      const { data, error } = await supabase.storage
        .from("boards_bg")
        .upload(`bg_${Date.now()}.jpg`, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("boards_bg")
        .getPublicUrl(data.path);

      bg_url = urlData.publicUrl;
    }

    const body = JSON.parse(req.body.data);

    const { data: dbData, error: dbErr } = await supabase
      .from("boards")
      .insert({
        concept: body.concept,
        fee: body.fee,
        prize: body.prize,
        contestants_count: body.contestants,
        open_from: body.openFrom,
        open_to: body.openTo,
        vote_from: body.voteFrom,
        vote_to: body.voteTo,
        result_date: body.resultDate,
        bg_url: bg_url
      })
      .select("*");

    if (dbErr) throw dbErr;

    res.json({ success: true, board: dbData[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/admin/createBoard", upload.single("background"), async (req, res) => {
  try {
    const {
      concept, fee, prize, contestants,
      open_from, open_to, vote_from, vote_to, result_date
    } = req.body;

    let backgroundUrl = null;

    /* ---------- 1. upload รูปไป Supabase Storage ---------- */
    if (req.file) {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `board_${Date.now()}.${fileExt}`;
      const filePath = `boards/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("boards")              // ชื่อ bucket
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("boards")
        .getPublicUrl(filePath);

      backgroundUrl = data.publicUrl;
    }

    /* ---------- 2. insert ลง Supabase DB ---------- */
    const { error: insertError } = await supabase
      .from("boards")
      .insert([{
        concept,
        fee,
        prize,
        contestants_count: contestants,
        open_from,
        open_to,
        vote_from,
        vote_to,
        result_date,
        background_url: backgroundUrl
      }]);

    if (insertError) throw insertError;

    res.json({ success: true });

  } catch (err) {
    console.error("❌ createBoard error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});


app.get("/boards/latest", async (req, res) => {
    const { data, error } = await supabase
        .from("boards")
        .select("*")
        .order("id", { ascending: false })
        .limit(1);

    if (error) return res.status(400).json({ success: false, error });

    res.json({ success: true, board: data[0] });
});
app.get('/boards', async (req, res) => {
    const { data, error } = await supabase
        .from('boards')
        .select(`
            id,
            concept,
            fee,
            prize,
            contestants_count,
            bg_url,
            open_from,
            open_to,
            vote_from,
            vote_to,
            vote_status,
            is_open_vote,
            wait_vote,
            open_vote,
            result_date
        `)
        .order('created_at', { ascending: false });

    if (error) return res.status(400).json(error);
    res.json(data);
});
app.delete("/admin/deleteBoard/:id", async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase
        .from("boards")
        .delete()
        .eq("id", id);

    if (error) {
        return res.status(500).json({ success: false, error });
    }

    res.json({ success: true });
});
app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("id", id)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
/* ----------------------------------------
   GET approved artworks
---------------------------------------- */
app.get("/payments/approved", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Payments")
      .select("*")
      .eq("approved", true)
      .order("id", { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    return res.json({
      success: true,
      data
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});
app.get("/payments/user/:userid", async (req, res) => {
  try {
    const userId = req.params.userid;
    const { data, error } = await supabase
      .from("Payments")
      .select(`
        id,
        user_id,
        artwork_name,
        artwork_type,
        artwork_url,
        created_at,
        confirmed_at,
        status,
        card_votes,
        failed_reason,
        approved,
        approved_at
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("/payments/user error:", err);
    return res.status(500).json({ success:false, message: err.message });
  }
});

// เปิดโหวตทั้งหมด (Supabase)
app.post('/admin/boards/openVote', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('boards')
      .update({ is_open_vote: true, vote_status: 'open_vote' })
      .neq('is_open_vote', true); // update only rows not yet open (optional)

    if (error) throw error;
    return res.json({ success: true, updated_count: Array.isArray(data) ? data.length : 0 });
  } catch (err) {
    console.error('openVote error', err);
    return res.status(500).json({ success: false, error: err.message || 'server error' });
  }
});


// ปิดโหวตทั้งหมด (Supabase)
app.post('/admin/boards/closeVote', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('boards')
      .update({
    is_open_vote: false,
    open_vote: false,
    vote_status: 'wait_vote'
})
      .neq('is_open_vote', false); // optional

    if (error) throw error;
    return res.json({ success: true, updated_count: Array.isArray(data) ? data.length : 0 });
  } catch (err) {
    console.error('closeVote error', err);
    return res.status(500).json({ success: false, error: err.message || 'server error' });
  }
});





// อัปเดตสถานะของ board ตาม id
app.put("/boards/:id", async (req, res) => {
    const { id } = req.params;
    const { vote_status, open_vote, wait_vote, is_open_vote } = req.body;

    const { data, error } = await supabase
        .from("boards")
        .update({
            vote_status,
            open_vote,
            wait_vote,
            is_open_vote
        })
        .eq("id", id)
        .select()
        .single();

    if (error) return res.status(400).json(error);
    res.json({ success: true, data });
});
// ---------------------------------------
// เปิดโหวตให้บอร์ดตัวเดียว (set open_vote / is_open_vote / vote_status)
// POST /boards/:id/openVote
// ---------------------------------------
app.post("/boards/:id/openVote", async (req, res) => {
  const id = req.params.id;
  try {
    const { data, error } = await supabase
      .from("boards")
      .update({
        open_vote: true,
        is_open_vote: true,
        vote_status: "open_vote",
        board_state: "open_vote"
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("openVote update error:", error);
      return res.status(500).json({ success: false, error: error.message || error });
    }
    return res.json({ success: true, board: data });
  } catch (err) {
    console.error("openVote exception:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------
// ย้ายบอร์ดกลับ (unset open_vote)
// POST /boards/:id/moveBack
// ---------------------------------------



app.post("/boards/:id/moveBack", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("boards")
      .update({
        vote_status: "wait_vote",
        is_open_vote: false,
        open_vote: false,   // ⭐ สำคัญที่สุด
        wait_vote: true,
        board_state: "payment"
      })
      .eq("id", id)
      .select();

    if (error) {
      console.error("moveBack update error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, board: data[0] });
  } catch (err) {
    console.error("moveBack exception:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// --------------------------------------------------
// เปิดโหวตทุกบอร์ด (ALL)
// POST /boards/openVoteAll
// --------------------------------------------------
app.post("/boards/openVoteAll", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("boards")
      .update({
        open_vote: true,
        is_open_vote: true,
        vote_status: "open_vote",
        board_state: "open_vote"
      })
      .neq("vote_status", "open_vote")  // อัปเดตเฉพาะที่ยังไม่เปิดโหวต
      .select();

    if (error) {
      console.error("openVoteAll update error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, boards: data });
  } catch (err) {
    console.error("openVoteAll exception:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/votes/check", async (req, res) => {
  try {
    const { user_id, concept } = req.body;

    const { data, error } = await supabase
      .from("Payments")
      .select("*")
      .eq("user_id", user_id)
      .eq("concept", concept)
      .maybeSingle();

    if (error) throw error;

    res.json({
      success: true,
      voted: !!data
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ตรวจสอบสิทธิ์ว่า user สามารถโหวตใน concept นี้ได้ไหม
async function canUserVoteInConcept(user_id, concept) {

  // ✔ ต้องมีผลงานใน concept นี้เท่านั้นถึงจะโหวตได้
  const { data: artworks, error } = await supabase
    .from("Payments")   // ← table ที่คุณใช้จริง
    .select("id")
    .eq("user_id", user_id)
    .eq("concept", concept)
    .limit(1);

  if (error) {
    console.error("Vote check error:", error);
    return false;
  }

  // มีผลงาน → โหวตได้
  return artworks && artworks.length > 0;
}

app.post("/votes/add", async (req, res) => {
  const { user_id, card_id, concept } = req.body;

  // 1) ตรวจสิทธิ์โหวต
  const allowed = await canUserVoteInConcept(user_id, concept);

  if (!allowed) {
    return res.status(403).json({
      success: false,
      error: "คุณไม่มีสิทธิ์โหวตใน Concept นี้ (ต้องมีผลงานประกวด)"
    });
  }

  // 2) บันทึกโหวต
  const { data, error } = await supabase
    .from("votes")
    .insert([{ user_id, card_id, concept }]);

  if (error) {
    console.error(error);
    return res.status(500).json({ success: false, error });
  }

  res.json({ success: true });
});


app.post("/payments/vote", async (req, res) => {
  const { user_id, payment_id } = req.body;

  try {
    // 1) โหลด artwork ปัจจุบัน
    const { data: artwork, error: artErr } = await supabase
      .from("Payments")
      .select("*")
      .eq("id", payment_id)
      .single();

    if (artErr || !artwork) {
      return res.json({ success: false, msg: "ไม่พบผลงาน" });
    }

    // 2) ห้ามโหวตผลงานตัวเอง
    if (artwork.user_id === user_id) {
      return res.json({ success: false, msg: "ไม่สามารถโหวตผลงานของตัวเองได้" });
    }

    const concept = artwork.concept;

    // ======================================================
    // ✅ [NEW - เงื่อนไขสำคัญที่คุณร้องขอ]
    // user ต้องมี payment ที่ status = approved ใน concept นี้เท่านั้น
    // ======================================================
    const { data: approvedPayment, error: approveErr } = await supabase
      .from("Payments")
      .select("id")
      .eq("user_id", user_id)
      .eq("concept", concept)
      .eq("status", "approved")
      .limit(1);

    if (approveErr) {
      console.error("approveErr:", approveErr);
      return res.json({
        success: false,
        msg: "ไม่สามารถตรวจสอบสถานะการอนุมัติได้"
      });
    }

    if (!approvedPayment || approvedPayment.length === 0) {
      return res.json({
        success: false,
        msg: "คุณยังไม่ได้รับการอนุมัติจากแอดมิน จึงไม่สามารถโหวตใน Concept นี้ได้"
      });
    }
    // ======================================================

    // 3) ตรวจว่าผู้โหวต มีสิทธิ์โหวตใน concept นี้ไหม (ต้องมีผลงานของตนใน Concept นั้น)
    const { data: userArt, error: userArtErr } = await supabase
      .from("Payments")
      .select("id")
      .eq("user_id", user_id)
      .eq("concept", concept)
      .limit(1);

    if (userArtErr) {
      console.error("userArtErr:", userArtErr);
      return res.json({
        success: false,
        msg: "ไม่สามารถตรวจสอบสิทธิ์การโหวตได้"
      });
    }

    if (!userArt || userArt.length === 0) {
      return res.json({
        success: false,
        msg: "คุณไม่มีสิทธิ์โหวตใน Concept นี้ (ต้องมีผลงานประกวด)"
      });
    }

    // 4) ตรวจว่า user เคยถูกบันทึกใน voted_users_per_concept ของ artwork ตัวนี้หรือยัง
    let votesByConcept = artwork.voted_users_per_concept || {};
    votesByConcept[concept] = votesByConcept[concept] || [];

    if (votesByConcept[concept].includes(user_id)) {
      return res.json({ success: false, msg: "คุณใช้สิทธิ์โหวตใน Concept นี้ไปแล้ว" });
    }

    // ====== 4.5) ตรวจสอบทั่วทั้งตาราง Payments (ของเดิมคุณ) ======
    const { data: allConceptArts, error: allErr } = await supabase
      .from("Payments")
      .select("id, voted_users_per_concept")
      .eq("concept", concept);

    if (allErr) {
      console.error("allErr:", allErr);
      return res.json({ success: false, msg: "ตรวจสอบโหวตล้มเหลว" });
    }

    const alreadyVoted = (allConceptArts || []).some(item => {
      const voted = item.voted_users_per_concept || {};
      const users = voted[concept] || [];
      return users.includes(user_id);
    });

    if (alreadyVoted) {
      return res.json({
        success: false,
        msg: "คุณได้ใช้สิทธิ์โหวต Concept นี้ไปแล้ว (โหวตได้เพียง 1 ครั้งต่อ 1 Concept)"
      });
    }
    // ======================================================

    // 5) บันทึกโหวต
    votesByConcept[concept].push(user_id);
    const newCount = (artwork.count_votes || 0) + 1;

    const { error: updateErr } = await supabase
      .from("Payments")
      .update({
        count_votes: newCount,
        voted_users_per_concept: votesByConcept
      })
      .eq("id", payment_id);

    if (updateErr) {
      console.error("updateErr:", updateErr);
      return res.json({ success: false, msg: "โหวตไม่สำเร็จ" });
    }

    return res.json({ success: true, newCount });

  } catch (err) {
    console.error("Server Error in /payments/vote:", err);
    return res.json({ success: false, msg: "Server Error" });
  }
});

/* -------------------------- Votes List (UserVotes.html ใช้) -------------------------- */

app.get("/votes/list", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Payments")
      .select(`
        id,
        user_id,
        artwork_name,
        artwork_type,
        artwork_url,
        card_votes,
        approved,
        approved_at,
        concept,
        fee,
        users:users!inner(id, name)
      `)
      .eq("approved", true)          // ✔ ต้อง approved
      .order("approved_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, items: data });
  } catch (err) {
    console.error("votes/list error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/user/update-account", async (req, res) => {
  try {
    const { 
      user_id, 
      account_type, 
      bank, 
      acc_num, 
      promptpay,
      first_name,
      last_name,
      phone 
    } = req.body;

    const { error } = await supabase
      .from("users")
      .update({
        account_type,
        bank,
        acc_num,
        promptpay,
        first_name,
        last_name,
        phone
      })
      .eq("id", user_id);

    if (error) throw error;

    return res.json({ success: true });

  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});
app.get("/users/info/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user_id)
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ success: false, error });
  }

  res.json({ success: true, data });
});





// อ่านก่อนลบ: ถ้าต้องการลบจริงจาก Payments
app.delete("/payments/delete/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { error } = await supabase.from("Payments").delete().eq("id", id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error("delete payment error:", err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
});
app.post("/admin/approve/:id", async (req, res) => {
  const id = req.params.id;

  try {
    console.log("APPROVE HIT:", id);

    // ✅ 1) อัปเดต payment เป็น approved + card_votes
    const { data, error } = await supabase
      .from("Payments")
      .update({
        approved: true,
        approved_at: new Date().toISOString(),
        status: "approved",
        card_votes: 1, // ✅ รวมจากอีกฟังก์ชัน
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const paymentConcept = data.concept;
    console.log("paymentConcept:", paymentConcept);

    // ✅ 2) นับจำนวน approved จาก Payments ตาม concept
    const { count, error: countErr } = await supabase
      .from("Payments")
      .select("id", { count: "exact", head: true })
      .eq("concept", paymentConcept)
      .eq("approved", true);

    if (countErr) {
      console.error("count contestants error:", countErr);
      throw countErr;
    }

    console.log("✅ REAL COUNT:", count);

    // ✅ 3) อัปเดต contestants_count เข้า boards
    const { error: boardErr } = await supabase
      .from("boards")
      .update({
        contestants_count: count,
      })
      .eq("concept", paymentConcept);

    if (boardErr) {
      console.error("update contestants_count error:", boardErr);
      throw boardErr;
    }

    // ✅ 4) ส่งผลลัพธ์กลับครบทุกค่า
    res.json({
      success: true,
      payment: data,
      contestants_count: count,
    });

  } catch (err) {
    console.error("approve error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ เช็คว่า user สมัคร concept นี้แล้วหรือยัง
app.get("/payments/check-duplicate", async (req, res) => {
  const { user_id, concept } = req.query;

  try {
    const { data, error } = await supabase
      .from("Payments")
      .select("id")
      .eq("user_id", user_id)
      .eq("concept", concept);

    if (error) throw error;

    res.json({
      success: true,
      isDuplicate: data.length > 0   // ✅ true = สมัครซ้ำ
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});
app.get("/votes/by-concept/:concept", async (req, res) => {
  const concept = req.params.concept;

  try {
    const { data, error } = await supabase
      .from("Payments")
      .select("*")
      .eq("concept", concept)
      .eq("approved", true);   // ✅ เอาเฉพาะที่อนุมัติแล้ว

    if (error) throw error;

    res.json({
      success: true,
      works: data   // ✅ ส่งทั้งหมด ไม่ใช่ชิ้นเดียว
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

app.post("/payments/create", async (req, res) => {
  try {
    const { user_id, board_id, concept, amount } = req.body;

    console.log("✅ PAYMENT INPUT:", req.body);

    // ✅ 0. CHECK DUPLICATE (กันสมัครซ้ำที่ Backend)
    const { data: dup, error: dupErr } = await supabase
      .from("payments")
      .select("id")
      .eq("user_id", user_id)
      .eq("concept", concept)
      .limit(1);

    if (dupErr) {
      return res.status(500).json({ success: false, message: dupErr.message });
    }

    if (dup.length > 0) {
      return res.status(400).json({
        success: false,
        isDuplicate: true,
        message: "1 User สามารถสมัครได้ Concept ละ 1 ครั้งเท่านั้น"
      });
    }

    // ✅ 1. Insert payment
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .insert([
        { user_id, board_id, concept, amount, status: "pending" }
      ])
      .select()
      .single();

    if (payErr) {
      return res.status(400).json({ success: false, message: payErr.message });
    }

    // ✅ 2. Load current board
    const { data: board, error: boardErr } = await supabase
      .from("boards")
      .select("contestants_count")
      .eq("id", board_id)
      .single();

    if (boardErr) {
      return res.status(400).json({ success: false, message: boardErr.message });
    }

    // ✅ 3. Increment contestants_count
    const newCount = Number(board.contestants_count || 0) + 1;

    // ✅ 4. Update contestants_count
    const { error: updErr } = await supabase
      .from("boards")
      .update({ contestants_count: newCount })
      .eq("id", board_id);

    if (updErr) {
      return res.status(400).json({ success: false, message: updErr.message });
    }

    // ✅ 5. Success
    res.json({ success: true, payment, newCount });

  } catch (err) {
    console.error("❌ PAYMENT SERVER ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/admin/approve/:paymentId", async (req, res) => {
  const { paymentId } = req.params;

  // 1. ดึง payment มาก่อน
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, board_id, approved")
    .eq("id", paymentId)
    .single();

  if (payErr || !payment)
    return res.status(404).json({ success: false, message: "Payment not found" });

  // 2. กันการ approve ซ้ำ
  if (payment.approved === true) {
    return res.json({ success: true, message: "Already approved" });
  }

  // 3. อัปเดต payment => approved
  const { error: updatePayErr } = await supabase
    .from("payments")
    .update({ approved: true, status: "approved" })
    .eq("id", paymentId);

  if (updatePayErr)
    return res.status(500).json({ success: false, message: "Approve failed" });

  // 4. เพิ่ม contestants_count ที่ boards
  const { error: boardErr } = await supabase.rpc("increment_contestant", {
    board_id_input: payment.board_id
  });

  if (boardErr)
    return res.status(500).json({ success: false, message: "Update board failed" });

  return res.json({ success: true });
});

// POST /payments/request-bank-info
app.post("/payments/request-bank-info", async (req, res) => {
  try {
    const { payment_id } = req.body;
    if (!payment_id) return res.status(400).json({ success: false, message: "Missing payment_id" });

    const { data, error } = await supabase
      .from("Payments")
      .update({ bank_info_requested: true })
      .eq("id", payment_id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, payment: data });
  } catch (err) {
    console.error("request-bank-info error:", err);
    return res.status(500).json({ success: false, message: err.message || err });
  }
});
// GET /payments/check-bank-requests?user_id=...
app.get("/payments/check-bank-requests", async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ success:false, message: "Missing user_id" });

    // หา payments ของผู้ใช้ที่ admin เคย request bank info
    const { data, error } = await supabase
      .from("Payments")
      .select("id, bank_info_requested")
      .eq("user_id", userId)
      .eq("bank_info_requested", true);

    if (error) throw error;

    return res.json({ success: true, needsBankInfo: (data && data.length > 0), items: data || [] });
  } catch (err) {
    console.error("check-bank-requests error:", err);
    return res.status(500).json({ success:false, message: err.message || err });
  }
});

// Upload evidence (admin) and attach to a payment
app.post("/payments/upload-evidence", upload.single("evidence"), async (req, res) => {
  try {
    const file = req.file;
    const { payment_id } = req.body;
    if (!payment_id) return res.status(400).json({ success: false, message: "Missing payment_id" });
    if (!file) return res.status(400).json({ success: false, message: "Missing file" });

    const path = `evidence/${payment_id}_${Date.now()}_${file.originalname}`;
    const { data, error } = await supabase.storage.from("evidence").upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

    if (error) throw error;

    // public url
    const pr = supabase.storage.from("evidence").getPublicUrl(path);
    const publicUrl = pr?.data?.publicUrl || pr?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/evidence/${encodeURIComponent(path.replace(/^evidence\//,''))}`;

    // update Payments
    const { error: updErr } = await supabase
      .from("Payments")
      .update({ evidence_url: publicUrl })
      .eq("id", payment_id);

    if (updErr) throw updErr;

    return res.json({ success: true, payment_id, url: publicUrl });
  } catch (err) {
    console.error("upload-evidence error:", err);
    return res.status(500).json({ success: false, message: err.message || err });
  }
});

app.post("/boards/collect", async (req, res) => {
  try {
    const { data: openBoards, error: bErr } = await supabase
      .from("boards")
      .select("id, concept, fee, contestants_count")
      .or("is_open_vote.eq.true,vote_status.eq.open_vote");

    if (bErr) throw bErr;
    if (!openBoards || openBoards.length === 0) {
      return res.json({ success: true, message: "No open boards to collect", boards: [] });
    }

    const concepts = openBoards.map(b => b.concept);

    const { data: payments, error: pErr } = await supabase
      .from("Payments")
      .select(`
        id,
        user_id,
        artwork_name,
        artwork_type,
        artwork_url,
        evidence_url,
        slip_url,
        confirmed_at,
        fee,
        concept,
        count_votes,
        approved,
        users:users!inner(
          id,email,name,account_type,
          bank,acc_num,promptpay,
          first_name,last_name,phone
        )
      `)
      .in("concept", concepts)
      .eq("approved", true)
      .order("count_votes", { ascending: false });

    if (pErr) throw pErr;

    // map board data
    const boardMap = {};
    openBoards.forEach(b => {
      boardMap[b.concept] = {
        fee: Number(b.fee || 0),
        contestants_count: Number(b.contestants_count || 0)
      };
    });

    // group payments by concept
    const grouped = {};
    (payments || []).forEach(p => {
      const c = p.concept || "__no_concept__";
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(p);
    });

    const galleryOut = [];

    Object.keys(grouped).forEach(concept => {
      const arr = grouped[concept].slice();
      arr.sort((a, b) => {
        const av = Number(a.count_votes || 0);
        const bv = Number(b.count_votes || 0);
        if (bv !== av) return bv - av;
        const at = a.confirmed_at ? new Date(a.confirmed_at).getTime() : 0;
        const bt = b.confirmed_at ? new Date(b.confirmed_at).getTime() : 0;
        return at - bt;
      });

      const bm = boardMap[concept] || { fee: 0, contestants_count: 0 };
      const pool = Number(bm.fee) * Number(bm.contestants_count);

      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const rank = i + 1;
        let prize = 0;
        if (rank === 1) prize = Math.round(pool * 0.40);
        else if (rank === 2) prize = Math.round(pool * 0.15);
        else if (rank === 3) prize = Math.round(pool * 0.05);

        galleryOut.push({
          ...p,
          rank,
          prize_money: prize,
          board_fee: bm.fee,
          board_contestants_count: bm.contestants_count
        });
      }
    });

    const boardIds = openBoards.map(b => b.id);

    // ✅ STEP เดิม: update boards
    const { data: updated, error: updErr } = await supabase
      .from("boards")
      .update({
        is_open_vote: false,
        open_vote: false,
        vote_status: "collected",
        board_state: "result"
      })
      .in("id", boardIds)
      .select();

    if (updErr) throw updErr;

    // ❌ ลบ DELETE boards ออก (ต้นเหตุที่ gallery ไม่ขึ้น)

    return res.json({
      success: true,
      boards_collected: updated,
      gallery: galleryOut
    });

  } catch (err) {
    console.error("boards.collect error:", err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

app.get("/gallery/list", async (req, res) => {
  try {
    const { data: boards, error: bErr } = await supabase
      .from("boards")
      .select("concept, fee, contestants_count")
      .eq("vote_status", "collected");

    if (bErr) throw bErr;

    const concepts = (boards || []).map(b => b.concept);
    if (!concepts.length) {
      return res.json({ success: true, items: [] });
    }

    const { data: payments, error: pErr } = await supabase
      .from("Payments")
      .select(`
        id,
        user_id,
        artwork_name,
        artwork_type,
        artwork_url,
        evidence_url,
        slip_url,
        confirmed_at,
        fee,
        concept,
        count_votes,
        approved,
        users:users!inner(
          id,email,name,account_type,
          bank,acc_num,promptpay,
          first_name,last_name,phone
        )
      `)
      .in("concept", concepts)
      .eq("approved", true);

    if (pErr) throw pErr;

    const boardMap = {};
    boards.forEach(b => {
      boardMap[b.concept] = {
        fee: Number(b.fee || 0),
        contestants_count: Number(b.contestants_count || 0)
      };
    });

    const grouped = {};
    (payments || []).forEach(p => {
      const c = p.concept || "__no_concept__";
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(p);
    });

    const out = [];

    Object.keys(grouped).forEach(concept => {
      const arr = grouped[concept].slice();

      // ✅ sort เดิมของคุณ (ไม่แตะ)
      arr.sort((a, b) => {
        const av = Number(a.count_votes || 0);
        const bv = Number(b.count_votes || 0);
        if (bv !== av) return bv - av;
        const at = a.confirmed_at ? new Date(a.confirmed_at).getTime() : 0;
        const bt = b.confirmed_at ? new Date(b.confirmed_at).getTime() : 0;
        return at - bt;
      });

      const bm = boardMap[concept] || { fee: 0, contestants_count: 0 };
      const pool = Number(bm.fee) * Number(bm.contestants_count);

      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const rank = i + 1;

        let prize = 0;
        if (rank === 1) prize = Math.round(pool * 0.40);
        else if (rank === 2) prize = Math.round(pool * 0.15);
        else if (rank === 3) prize = Math.round(pool * 0.05);

        out.push({
          ...p,                      // ของเดิมทั้งหมด
          user_name: p.users?.name || "-", // ✅ เพิ่มแค่นี้
          rank,
          prize_money: prize,
          board_fee: bm.fee,
          board_contestants_count: bm.contestants_count
        });
      }
    });

    return res.json({ success: true, items: out });

  } catch (err) {
    console.error("gallery/list error:", err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

app.get("/gallery/user/:user_id", async (req, res) => {
  try {
    const userId = req.params.user_id;
    const { data: boards } = await supabase.from("boards").select("concept, fee, contestants_count").eq("vote_status", "collected");
    const concepts = (boards || []).map(b => b.concept);
    if (!concepts.length) return res.json({ success: true, items: [] });

    const { data: payments, error } = await supabase
      .from("Payments")
      .select(`
        id,
        user_id,
        artwork_name,
        artwork_type,
        artwork_url,
        evidence_url,
        slip_url,
        confirmed_at,
        fee,
        concept,
        count_votes,
        approved,
        users:users!inner(id,email,name,account_type,bank,acc_num,promptpay,first_name,last_name,phone)
      `)
      .in("concept", concepts)
      .eq("approved", true)
      .eq("user_id", userId);

    if (error) throw error;

    // compute ranks as same approach (need all payments in these concepts)
    const { data: allPayments } = await supabase
      .from("Payments")
      .select("concept,count_votes,confirmed_at,id,artwork_name,user_id,artwork_url,users:users!inner(id,email,name,account_type,bank,acc_num,promptpay,first_name,last_name,phone)")
      .in("concept", concepts)
      .eq("approved", true);

    // map board info
    const boardMap = {};
    boards.forEach(b => boardMap[b.concept] = { fee: Number(b.fee||0), contestants_count: Number(b.contestants_count||0) });

    const grouped = {};
    (allPayments || []).forEach(p => {
      const c = p.concept || "__no_concept__";
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(p);
    });

    const maxMap = {};
    Object.keys(grouped).forEach(concept=>{
      const arr = grouped[concept].slice();
      arr.sort((a,b)=> {
        const av = Number(a.count_votes||0), bv = Number(b.count_votes||0);
        if (bv !== av) return bv - av;
        const at = a.confirmed_at ? new Date(a.confirmed_at).getTime() : 0;
        const bt = b.confirmed_at ? new Date(b.confirmed_at).getTime() : 0;
        return at - bt;
      });
      // compute prize
      const bm = boardMap[concept] || { fee:0, contestants_count:0 };
      const pool = bm.fee * bm.contestants_count;
      for (let i=0;i<arr.length;i++){
        const rank = i+1;
        let prize=0;
        if(rank===1) prize = Math.round(pool*0.40);
        else if(rank===2) prize = Math.round(pool*0.15);
        else if(rank===3) prize = Math.round(pool*0.05);
        arr[i].rank = rank;
        arr[i].prize_money = prize;
      }
      // save back
      grouped[concept] = arr;
    });

    // filter to the payments of this user and attach rank/prize
    const items = (payments || []).map(p=>{
      const arr = grouped[p.concept] || [];
      const me = arr.find(a => String(a.id) === String(p.id)) || {};
      return {
        ...p,
        rank: me.rank || null,
        prize_money: me.prize_money || 0,
        board_fee: boardMap[p.concept]?.fee || 0,
        board_contestants_count: boardMap[p.concept]?.contestants_count || 0
      };
    });

    return res.json({ success: true, items });
  } catch (err) {
    console.error("gallery/user error:", err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
});
app.post("/admin/request-bank-info", async (req, res) => {
  const { payment_id } = req.body;

  try {
    const { error } = await supabase
      .from("payments")
      .update({ bank_info_requested: true })
      .eq("id", payment_id);

    if (error) throw error;

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// ✅ เช็คสิทธิ์โหวต: user ต้องมี payment status = approved ใน concept นี้
app.post("/payments/check-vote-right", async (req, res) => {
  try {
    const { user_id, concept } = req.body;

    if (!user_id || !concept) {
      return res.json({ success: false, canVote: false });
    }

    const { data, error } = await supabase
      .from("Payments")
      .select("id")
      .eq("user_id", user_id)
      .eq("concept", concept)
      .eq("status", "approved")
      .limit(1);

    if (error) {
      return res.json({ success: false, canVote: false });
    }

    if (data.length === 0) {
      return res.json({ success: true, canVote: false });
    }

    return res.json({ success: true, canVote: true });

  } catch (err) {
    res.json({ success: false, canVote: false });
  }
});


app.get("/payments/voters/:payment_id", async (req, res) => {
  const { payment_id } = req.params;

  try {
    const { data: payment, error: payErr } = await supabase
      .from("Payments")
      .select("voted_users_per_concept, concept")
      .eq("id", payment_id)
      .single();

    if (payErr || !payment) {
      return res.status(404).json({ success: false, message: "ไม่พบผลงาน" });
    }

    const concept = payment.concept;
    const votedUsers = (payment.voted_users_per_concept || {})[concept] || [];
    
    if (votedUsers.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const { data: users, error: userErr } = await supabase
      .from("users")
      .select("id, name, profile_image")
      .in("id", votedUsers);

    if (userErr) throw userErr;

    const result = users.map(u => ({
      id: u.id,
      name: u.name || "ไม่ทราบชื่อ",
      profile_image: u.profile_image || "images/Uservote/icon.png"
    }));

    return res.json({ success: true, data: result });

  } catch (err) {
    console.error("payments/voters error:", err);
    return res.status(500).json({ success: false, message: "โหลดรายชื่อผู้โหวตไม่สำเร็จ" });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
