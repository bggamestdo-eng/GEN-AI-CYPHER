// server.js (Node.js + Express)
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client('88444590813-lbupe3tkp7t9gg0hqme2snoo200ogt6n.apps.googleusercontent.com');

const app = express();
app.use(express.json());

app.post('/auth/google', async (req, res) => {
  const { id_token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: '88444590813-lbupe3tkp7t9gg0hqme2snoo200ogt6n.apps.googleusercontent.com',
    });
    const payload = ticket.getPayload();
    // payload มีข้อมูลเช่น: sub (user id), email, email_verified, name, picture
    const googleUserId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    // TODO: หา user ใน DB ถ้ามีให้ล็อกอิน ถ้าไม่มีให้สร้างบัญชีใหม่
    // สร้าง session / JWT ของคุณเอง แล้วส่งกลับ
    res.json({ success: true, email, name });
  } catch (err) {
    console.error(err);
    res.status(401).json({ success: false, message: 'Invalid ID token' });
  }
});

app.listen(3000, () => console.log('Server listening on :3000'));
