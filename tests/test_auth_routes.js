const http = require('http');
const express = require('express');
require('dotenv').config();

const authRouter = require('../routes/auth');
const authGuruRouter = require('../routes/authGuru');

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use('/api/auth', authGuruRouter);

async function test() {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log('Testing /auth/login with NIP (Guru):');
  const res1 = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip: '198501012010011001', password: 'guru123' })
  });
  const data1 = await res1.json();
  console.log('Status /auth/login (Guru NIP):', res1.status, data1.guru ? data1.guru.nama_guru : data1);

  console.log('Testing /auth/login with Admin:');
  const res2 = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'guru123' })
  });
  console.log('Status /auth/login (Admin wrong pass):', res2.status);

  console.log('Testing /api/auth/login with NIP (Guru):');
  const res3 = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip: '198501012010011001', password: 'guru123' })
  });
  const data3 = await res3.json();
  console.log('Status /api/auth/login:', res3.status, data3.guru ? data3.guru.nama_guru : data3);

  server.close();
  if (res1.status === 200 && res3.status === 200) {
    console.log('✅ BOTH ENDPOINTS ACCEPT GURU NIP SUCCESSFULLY!');
  } else {
    throw new Error('Test failed');
  }
}

test().catch(e => { console.error(e); process.exit(1); });

