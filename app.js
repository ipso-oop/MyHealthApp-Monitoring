const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();

// Middleware Setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.set('view engine', 'ejs');

// MongoDB Setup
const mongoURI =  process.env.MONGODB_URI;
const client = new MongoClient(mongoURI);
let db;

// Mailer Setup (Dummy-Konfiguration für Demo)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'example@gmail.com',
    pass: 'password'
  }
});

// Verbindung zu MongoDB herstellen
async function connectToDB() {
  await client.connect();
  db = client.db(process.env.MONGODB_DB_NAME || 'health_app_db');
  console.log('Mit MongoDB verbunden');
}

// Startseite
app.get('/', (req, res) => {
  res.render('index');
});

// Registrierung
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
	await connectToDB();
    await db.collection('users').insertOne({ username, password: hashedPassword, email });
    res.redirect('/login');
  } catch (error) {
    res.status(500).send('Fehler bei der Registrierung');
  }
});

// Login
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  await connectToDB();
  const user = await db.collection('users').findOne({ username });
  if (user && bcrypt.compareSync(password, user.password)) {
    res.cookie('user', user._id.toString());
    res.redirect('/dashboard');
  } else {
    res.send('Login fehlgeschlagen');
  }
});

// Dashboard
app.get('/dashboard', async (req, res) => {
  const userId = req.cookies.user;
  if (!userId) return res.redirect('/login');
  await connectToDB();
  const healthData = await db.collection('health_data').find({ userId }).toArray();
  res.render('dashboard', { healthData });
});

// Hinzufügen von Gesundheitsdaten
app.post('/health_data/add', async (req, res) => {
  const userId = req.cookies.user;
  const { data, category } = req.body;
  await connectToDB();
  await db.collection('health_data').insertOne({ userId, data, category });
  res.send('Daten hinzugefügt');
});

// Bearbeiten von Gesundheitsdaten
app.post('/health_data/edit', async (req, res) => {
  const { id, data, category } = req.body;
  await connectToDB();
  await db.collection('health_data').updateOne({ _id: new ObjectId(id) }, { $set: { data, category } });
  res.send('Daten aktualisiert');
});

// Löschen von Gesundheitsdaten
app.post('/health_data/delete', async (req, res) => {
  const { id } = req.body;
  await connectToDB();
  await db.collection('health_data').deleteOne({ _id: new ObjectId(id) });
  res.send('Daten gelöscht');
});

// Freigabe von Gesundheitsdaten
app.post('/health_data/share', async (req, res) => {
  const { healthDataId } = req.body;
  const accessCode = Math.random().toString(36).substr(2, 8);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 Stunde gültig
  await connectToDB();
  await db.collection('access_links').insertOne({ healthDataId, accessCode, expiresAt });
  res.send(`Freigabelink erstellt. Zugangscode: ${accessCode}`);
});

// Zugriff auf freigegebene Gesundheitsdaten
app.get('/health_data/access', async (req, res) => {
  const { code } = req.query;
  await connectToDB();
  const link = await db.collection('access_links').findOne({ accessCode: code, expiresAt: { $gt: new Date() } });
  if (!link) return res.send('Ungültiger oder abgelaufener Zugangscode');

  const healthData = await db.collection('health_data').findOne({ _id: new ObjectId(link.healthDataId) });
  if (healthData) {
    res.json(healthData);
    sendAccessNotification(healthData.userId); // Benachrichtigung
  } else {
    res.send('Gesundheitsdaten nicht gefunden');
  }
});

// Benachrichtigung
async function sendAccessNotification(userId) {
  await connectToDB();
  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
  if (user) {
    transporter.sendMail({
      from: 'example@gmail.com',
      to: user.email,
      subject: 'Zugriff auf Gesundheitsdaten',
      text: `Ihre Gesundheitsdaten wurden abgerufen.`
    });
  }
}

// Server starten
/*app.listen(3000, async () => {
  await connectToDB();
  console.log('Server läuft auf http://localhost:3000');
});*/

module.exports = { app };
