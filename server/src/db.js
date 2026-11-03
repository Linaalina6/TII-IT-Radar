import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "server", "data");
fs.mkdirSync(dataDir, { recursive: true });
export const db = new Database(path.join(dataDir, "radar.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT DEFAULT 'user', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS Categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS Sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, type TEXT DEFAULT 'rss', active INTEGER DEFAULT 1, last_checked TEXT, last_error TEXT);
CREATE TABLE IF NOT EXISTS News (id INTEGER PRIMARY KEY, title TEXT NOT NULL, summary TEXT, content TEXT, image_url TEXT, source_name TEXT, source_url TEXT UNIQUE, category_id INTEGER REFERENCES Categories(id), published_at TEXT, demo INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS Events (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, organizer TEXT, category_id INTEGER REFERENCES Categories(id), location TEXT, format TEXT DEFAULT 'Онлайн', start_date TEXT, deadline TEXT, registration_url TEXT, status TEXT DEFAULT 'Открыта', demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS Opportunities (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, organizer TEXT, category_id INTEGER REFERENCES Categories(id), location TEXT, format TEXT, start_date TEXT, deadline TEXT, registration_url TEXT, status TEXT, demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS Favorites (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES Users(id) ON DELETE CASCADE, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, UNIQUE(user_id,item_type,item_id));
CREATE TABLE IF NOT EXISTS Notifications (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES Users(id) ON DELETE CASCADE, title TEXT NOT NULL, message TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS UserPreferences (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES Users(id) ON DELETE CASCADE, category_id INTEGER REFERENCES Categories(id), UNIQUE(user_id,category_id));
CREATE TABLE IF NOT EXISTS Drafts (id INTEGER PRIMARY KEY, news_id INTEGER REFERENCES News(id) ON DELETE SET NULL, title TEXT, summary TEXT, facts TEXT, category TEXT, source_url TEXT, website_text TEXT, social_text TEXT, status TEXT DEFAULT 'Черновик', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const categories = [
 ["IT и искусственный интеллект","it-ai","Технологии, ИИ, программирование и кибербезопасность"],
 ["IT-образование","education","Обучение, курсы и образовательные программы"],
 ["Хакатоны и олимпиады","hackathons","Соревнования и олимпиады"],
 ["Конкурсы и стартапы","startups","Стартапы, акселераторы и конкурсы"],
 ["Гранты и финансирование","grants","Грантовые и исследовательские программы"],
 ["Стажировки и обучение","internships","Стажировки, школы и сертификация"],
 ["Конференции и мероприятия","events","Форумы, конференции и вебинары"]
];
const addCat = db.prepare("INSERT OR IGNORE INTO Categories(name,slug,description) VALUES(?,?,?)");
categories.forEach(c => addCat.run(...c));

if (process.env.NODE_ENV === "production" &&
    (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) {
  throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD");
}

const adminName = process.env.ADMIN_USERNAME || "admin";
const adminPass = process.env.ADMIN_PASSWORD || "admin12345";
if (!db.prepare("SELECT id FROM Users WHERE username=?").get(adminName)) {
  db.prepare("INSERT INTO Users(username,password_hash,role) VALUES(?,?,?)").run(adminName, bcrypt.hashSync(adminPass, 10), "admin");
}
const catId = slug => db.prepare("SELECT id FROM Categories WHERE slug=?").get(slug)?.id;
const newsCount = db.prepare("SELECT COUNT(*) n FROM News").get().n;
if (!newsCount) {
  const items = [
    ["Как искусственный интеллект меняет разработку ПО","ИИ-инструменты помогают разработчикам анализировать код, писать тесты и быстрее находить ошибки.","Обзор направлений применения ИИ в повседневной разработке программного обеспечения.","Tech Radar","https://example.org/demo/ai-development","it-ai"],
    ["Открытые инструменты для изучения машинного обучения","Подборка учебных инструментов и библиотек для первых экспериментов с ML.","Материал носит ознакомительный характер и содержит демонстрационные сведения.","TII IT Radar","https://example.org/demo/ml-tools","education"],
    ["Командная разработка: практики Git","Основные правила совместной работы над программными проектами.","Разбор веток, запросов на слияние и проверки изменений.","TII IT Radar","https://example.org/demo/git","it-ai"],
    ["Основы безопасной разработки","Почему проверка входных данных и управление доступом важны для веб-приложений.","Демонстрационный материал по базовым принципам AppSec.","TII IT Radar","https://example.org/demo/security","it-ai"],
    ["Как подготовиться к студенческому хакатону","План подготовки команды: идея, прототип, презентация и распределение ролей.","Практические рекомендации для начинающих участников.","TII IT Radar","https://example.org/demo/hackathon","hackathons"],
    ["Онлайн-обучение: как выбрать курс по программированию","Критерии выбора программы обучения и оценки практических заданий.","Сравнивайте содержание, нагрузку и формат обратной связи.","TII IT Radar","https://example.org/demo/courses","education"],
    ["Стартап-идея: от проблемы к прототипу","Первые шаги проверки гипотезы и создания минимального продукта.","Демонстрационная публикация о поиске пользовательской проблемы.","TII IT Radar","https://example.org/demo/startup","startups"],
    ["Исследовательские проекты для студентов IT","Как сформулировать тему, цель и план небольшого исследования.","Пример структуры учебного исследования.","TII IT Radar","https://example.org/demo/research","grants"],
    ["Стажировка: что добавить в портфолио","Проекты, README и описание личного вклада помогают показать навыки.","Материал о подготовке портфолио начинающего разработчика.","TII IT Radar","https://example.org/demo/portfolio","internships"],
    ["Облачные технологии для начинающих","Ключевые понятия облачной инфраструктуры и варианты практики.","Знакомство с вычислениями, хранением данных и сетевыми сервисами.","TII IT Radar","https://example.org/demo/cloud","it-ai"],
    ["Введение в анализ данных","Этапы подготовки, анализа и визуализации наборов данных.","Демонстрационная публикация для начинающих аналитиков.","TII IT Radar","https://example.org/demo/data","education"],
    ["Кибергигиена в студенческих проектах","Пароли, резервные копии и обновления как базовые меры защиты.","Краткий обзор безопасной работы с учебными сервисами.","TII IT Radar","https://example.org/demo/cyber-hygiene","it-ai"],
    ["Научные конференции: подготовка тезисов","Структура тезисов и важность корректного описания результатов.","Общие рекомендации для студенческих выступлений.","TII IT Radar","https://example.org/demo/abstracts","events"],
    ["Первые шаги в open source","Как выбрать задачу и оформить понятный pull request.","Практика командной разработки на открытых проектах.","TII IT Radar","https://example.org/demo/opensource","it-ai"],
    ["Сертификация IT-навыков","Когда сертификат полезен и как соотнести его с практическими навыками.","Демонстрационный обзор способов подтвердить знания.","TII IT Radar","https://example.org/demo/certification","internships"]
  ]
  const insert = db.prepare("INSERT INTO News(title,summary,content,source_name,source_url,category_id,published_at,demo) VALUES(?,?,?,?,?,?,?,1)");
  items.forEach((x,i)=>insert.run(x[0],x[1],x[2],x[3],x[4],catId(x[5]),new Date(Date.now()-i*86400000).toISOString()));
}
const eventCount = db.prepare("SELECT COUNT(*) n FROM Events").get().n;
if (!eventCount) {
  const ev = [
   ["Студенческий AI-хакатон (демо)","Командная разработка прототипа с использованием методов ИИ.","TII IT Radar","hackathons","Казахстан","Онлайн","2027-02-10","2027-02-01"],
   ["Олимпиада по программированию (демо)","Индивидуальное решение алгоритмических задач.","TII IT Radar","hackathons","Казахстан","Офлайн","2027-03-12","2027-03-01"],
   ["Вводный вебинар по React (демо)","Практическое знакомство с компонентным подходом.","TII IT Radar","education","Онлайн","Онлайн","2027-01-20","2027-01-18"],
   ["Конкурс студенческих стартапов (демо)","Представление идеи и прототипа экспертам.","TII IT Radar","startups","Казахстан","Гибридный","2027-04-05","2027-03-20"],
   ["Грантовая программа для исследований (демо)","Учебный пример карточки исследовательской поддержки.","TII IT Radar","grants","Казахстан","Онлайн","2027-05-01","2027-04-01"],
   ["Летняя IT-школа (демо)","Интенсив по разработке и командным проектам.","TII IT Radar","internships","Онлайн","Офлайн","2027-06-15","2027-05-30"],
   ["Стажировка начинающего frontend-разработчика (демо)","Учебный пример описания стажировки.","TII IT Radar","internships","Казахстан","Гибридный","2027-02-01","2027-01-10"],
   ["Конференция Digital Future (демо)","Доклады о цифровых технологиях и образовании.","TII IT Radar","events","Казахстан","Офлайн","2027-04-18","2027-04-10"],
   ["Вебинар по кибербезопасности (демо)","Основы защиты веб-приложений.","TII IT Radar","it-ai","Онлайн","Онлайн","2027-02-25","2027-02-23"],
   ["Конкурс проектов по анализу данных (демо)","Создание проекта на основе открытого набора данных.","TII IT Radar","hackathons","Онлайн","Онлайн","2027-03-28","2027-03-15"]
  ]
const ins = db.prepare("INSERT INTO Events(title,description,organizer,category_id,location,format,start_date,deadline,status,demo) VALUES(?,?,?,?,?,?,?,?,?,1)");  ev.forEach(x=>ins.run(x[0],x[1],x[2],catId(x[3]),x[4],x[5],x[6],x[7],"Открыта"));
}
