/**
 * Cloud Functions — Plataforma de Inteligência (Talita Oliveira)
 *
 * Estas funções rodam no servidor do Google com o Admin SDK (ignoram as
 * regras do Firestore). São a camada de segurança "à prova de fraude":
 *   - vincularLideranca: valida o código de vínculo NO SERVIDOR
 *   - cadastroPublico:   grava o cadastro do link sem expor o banco a anônimos
 *   - infoLink:          devolve só o nome da liderança pra exibir na tela
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const REGION = 'southamerica-east1'; // São Paulo

// Chave da API do Claude (definir via: firebase functions:secrets:set ANTHROPIC_API_KEY)
const ANTHROPIC_KEY = defineSecret('ANTHROPIC_API_KEY');

function gerarLinkCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem 0/o/1/i/l
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

const str = (v) => (v == null ? '' : String(v)).trim();

/* ───────── 1. Vincular liderança ao login (valida código no servidor) ───────── */
exports.vincularLideranca = onCall({ region: REGION }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login primeiro.');

  const codigo = str(request.data && request.data.codigo).toLowerCase();
  const nome   = str(request.data && request.data.nome);
  if (!codigo) throw new HttpsError('invalid-argument', 'Informe o código de vínculo.');

  // Já existe conta de usuário pra esse uid?
  const jaUser = await db.collection('usuarios').doc(uid).get();
  if (jaUser.exists) throw new HttpsError('already-exists', 'Esta conta já está vinculada.');

  // Procura a liderança pelo código
  const snap = await db.collection('liderancas').where('cod_acesso', '==', codigo).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'Código de vínculo inválido.');
  const ld = snap.docs[0];
  if (ld.data().auth_uid) throw new HttpsError('failed-precondition', 'Essa liderança já tem um acesso criado.');

  const email = (request.auth.token && request.auth.token.email) || '';
  await ld.ref.update({ auth_uid: uid });
  await db.collection('usuarios').doc(uid).set({
    nome: nome || ld.data().nome || email.split('@')[0] || 'Liderança',
    email,
    role: 'lideranca',
    liderancaId: ld.id,
    status: 'ativo',
    created_at: FieldValue.serverTimestamp()
  });
  return { ok: true, liderancaId: ld.id };
});

/* ───────── 2. Cadastro público via link de indicação (sem login anônimo) ───────── */
exports.cadastroPublico = onCall({ region: REGION }, async (request) => {
  const d = request.data || {};
  const link      = str(d.link_code).toLowerCase();
  const nome      = str(d.nome);
  const telefone  = str(d.telefone);
  const municipio = str(d.municipio);
  const bairro    = str(d.bairro);

  if (!link) throw new HttpsError('invalid-argument', 'Link inválido.');
  if (nome.length < 2) throw new HttpsError('invalid-argument', 'Informe seu nome.');
  if (telefone.replace(/\D/g, '').length < 10) throw new HttpsError('invalid-argument', 'Informe um telefone válido.');

  const snap = await db.collection('liderancas').where('link_code', '==', link).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'Link de indicação inválido.');
  const parent = snap.docs[0];

  await db.collection('liderancas').add({
    nome, telefone, municipio, bairro,
    parent_id: parent.id,
    tipo: 'lead',
    created_via: 'afiliado',
    link_code: gerarLinkCode(),
    votos_comprometidos: 0,
    status: 'Prospecto',
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  });
  return { ok: true };
});

/* ───────── 3. Info pública do link (só o nome, pra exibir na tela) ───────── */
exports.infoLink = onCall({ region: REGION }, async (request) => {
  const link = str(request.data && request.data.link_code).toLowerCase();
  if (!link) throw new HttpsError('invalid-argument', 'Link inválido.');
  const snap = await db.collection('liderancas').where('link_code', '==', link).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'Link inválido.');
  const l = snap.docs[0].data();
  return { nome: l.nome || '', municipio: l.municipio || '' };
});

/* ───────── 4. Ler ficha por foto (Claude visão) — extrai dados de cadastro ───────── */
exports.lerFicha = onCall({ region: REGION, secrets: [ANTHROPIC_KEY], timeoutSeconds: 70, memory: '512MiB' }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login.');
  // Só usuário ATIVO pode usar (admin/usuário/liderança aprovados)
  const u = await db.collection('usuarios').doc(uid).get();
  if (!u.exists || u.data().status !== 'ativo') throw new HttpsError('permission-denied', 'Conta não autorizada.');

  let img = str(request.data && request.data.image);
  if (!img) throw new HttpsError('invalid-argument', 'Envie uma imagem.');
  let media = 'image/jpeg', b64 = img;
  const m = img.match(/^data:(image\/[a-zA-Z]+);base64,([\s\S]+)$/);
  if (m) { media = m[1]; b64 = m[2]; }

  const prompt = `Esta é a foto de uma ficha de cadastro (pode ter uma ou várias pessoas). Extraia os dados de cada pessoa.
Responda SOMENTE com um JSON array (sem texto antes/depois), neste formato:
[{"nome":"...","telefone":"...","municipio":"...","bairro":"..."}]
Regras: telefone só com dígitos (com DDD); se um campo não aparecer use ""; inclua TODAS as pessoas da ficha; se não conseguir ler nada, responda [].`;

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY.value(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
  } catch (e) { throw new HttpsError('internal', 'Falha ao chamar a IA: ' + e.message); }
  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new HttpsError('internal', 'IA retornou ' + resp.status + ': ' + t.slice(0, 180)); }

  const data = await resp.json();
  let txt = (data.content && data.content[0] && data.content[0].text) || '[]';
  const jm = txt.match(/\[[\s\S]*\]/);
  let pessoas = [];
  try { pessoas = JSON.parse(jm ? jm[0] : txt); } catch (e) { pessoas = []; }
  if (!Array.isArray(pessoas)) pessoas = [];
  pessoas = pessoas.slice(0, 80).map(p => ({
    nome: str(p && p.nome), telefone: str(p && p.telefone).replace(/\D/g, ''),
    municipio: str(p && p.municipio), bairro: str(p && p.bairro)
  })).filter(p => p.nome);
  return { pessoas };
});
