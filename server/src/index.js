import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Parser from "rss-parser";
import cron from "node-cron";
import { db } from "./db.js";

const app=express(), port=process.env.PORT||4000, parser=new Parser();
app.use(cors()); app.use(express.json({limit:"1mb"}));
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-change-me";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production");
}
const auth=(req,res,next)=>{try{const token=(req.headers.authorization||"").replace("Bearer ","");req.user=jwt.verify(token,JWT_SECRET);next();}catch{return res.status(401).json({error:"Требуется авторизация"});}};
const admin=(req,res,next)=>req.user?.role==="admin"?next():res.status(403).json({error:"Недостаточно прав"});
const rows=(sql,...p)=>db.prepare(sql).all(...p), one=(sql,...p)=>db.prepare(sql).get(...p);
const categories=()=>rows("SELECT * FROM Categories ORDER BY id");
app.get("/api/health",(req,res)=>res.json({ok:true}));
app.get("/api/categories",(req,res)=>res.json(categories()));
app.post("/api/auth/login",(req,res)=>{const {username,password}=req.body;const u=one("SELECT * FROM Users WHERE username=?",[username]);if(!u||!bcrypt.compareSync(password||"",u.password_hash))return res.status(401).json({error:"Неверный логин или пароль"});const token=jwt.sign({id:u.id,username:u.username,role:u.role},JWT_SECRET,{expiresIn:"7d"});res.json({token,user:{id:u.id,username:u.username,role:u.role}});});
app.get("/api/me",auth,(req,res)=>res.json(req.user));
app.get("/api/news",(req,res)=>{let sql="SELECT News.*,Categories.name category FROM News LEFT JOIN Categories ON Categories.id=News.category_id WHERE 1=1",p=[];if(req.query.q){sql+=" AND (News.title LIKE ? OR News.summary LIKE ? OR News.content LIKE ?)";p.push(...Array(3).fill(`%${req.query.q}%`));}if(req.query.category){sql+=" AND Categories.slug=?";p.push(req.query.category);}sql+=" ORDER BY datetime(published_at) "+(req.query.sort==="oldest"?"ASC":"DESC");res.json(rows(sql,...p));});
app.get("/api/news/:id",(req,res)=>{const n=one("SELECT News.*,Categories.name category FROM News LEFT JOIN Categories ON Categories.id=News.category_id WHERE News.id=?",Number(req.params.id));n?res.json(n):res.status(404).json({error:"Не найдено"});});
app.post("/api/news",auth,admin,(req,res)=>{const n=req.body;const r=db.prepare("INSERT INTO News(title,summary,content,source_name,source_url,category_id,published_at,demo) VALUES(?,?,?,?,?,?,?,0)").run(n.title,n.summary,n.content,n.source_name||"Администратор",n.source_url||null,n.category_id||null,n.published_at||new Date().toISOString());res.json({id:r.lastInsertRowid});});
app.put("/api/news/:id",auth,admin,(req,res)=>{const n=req.body;db.prepare("UPDATE News SET title=?,summary=?,content=?,source_name=?,source_url=?,category_id=? WHERE id=?").run(n.title,n.summary,n.content,n.source_name,n.source_url,n.category_id,req.params.id);res.json({ok:true});});
app.delete("/api/news/:id",auth,admin,(req,res)=>{db.prepare("DELETE FROM News WHERE id=?").run(req.params.id);res.json({ok:true});});
app.get("/api/events",(req,res)=>{let sql="SELECT Events.*,Categories.name category,Categories.slug category_slug FROM Events LEFT JOIN Categories ON Categories.id=Events.category_id WHERE 1=1",p=[];if(req.query.q){sql+=" AND (title LIKE ? OR description LIKE ?)";p.push(`%${req.query.q}%`,`%${req.query.q}%`);}if(req.query.category){sql+=" AND Categories.slug=?";p.push(req.query.category);}if(req.query.format){sql+=" AND format=?";p.push(req.query.format);}sql+=" ORDER BY start_date";res.json(rows(sql,...p));});
app.post("/api/events",auth,admin,(req,res)=>{const e=req.body;const r=db.prepare("INSERT INTO Events(title,description,organizer,category_id,location,format,start_date,deadline,registration_url,status,demo) VALUES(?,?,?,?,?,?,?,?,?,?,0)").run(e.title,e.description,e.organizer,e.category_id,e.location,e.format,e.start_date,e.deadline,e.registration_url,e.status||"Открыта");res.json({id:r.lastInsertRowid});});
app.put("/api/events/:id",auth,admin,(req,res)=>{const e=req.body;db.prepare("UPDATE Events SET title=?,description=?,organizer=?,category_id=?,location=?,format=?,start_date=?,deadline=?,registration_url=?,status=? WHERE id=?").run(e.title,e.description,e.organizer,e.category_id,e.location,e.format,e.start_date,e.deadline,e.registration_url,e.status,req.params.id);res.json({ok:true});});
app.delete("/api/events/:id",auth,admin,(req,res)=>{db.prepare("DELETE FROM Events WHERE id=?").run(req.params.id);res.json({ok:true});});
app.get("/api/favorites",auth,(req,res)=>res.json(rows("SELECT * FROM Favorites WHERE user_id=?",req.user.id)));
app.post("/api/favorites",auth,(req,res)=>{const {item_type,item_id}=req.body;db.prepare("INSERT OR IGNORE INTO Favorites(user_id,item_type,item_id) VALUES(?,?,?)").run(req.user.id,item_type,item_id);res.json({ok:true});});
app.delete("/api/favorites/:type/:id",auth,(req,res)=>{db.prepare("DELETE FROM Favorites WHERE user_id=? AND item_type=? AND item_id=?").run(req.user.id,req.params.type,req.params.id);res.json({ok:true});});
app.get("/api/sources",auth,admin,(req,res)=>res.json(rows("SELECT * FROM Sources ORDER BY id DESC")));
app.post("/api/sources",auth,admin,(req,res)=>{const s=req.body;const r=db.prepare("INSERT INTO Sources(name,url,type) VALUES(?,?,?)").run(s.name,s.url,s.type||"rss");res.json({id:r.lastInsertRowid});});
app.delete("/api/sources/:id",auth,admin,(req,res)=>{db.prepare("DELETE FROM Sources WHERE id=?").run(req.params.id);res.json({ok:true});});
async function updateFeeds(){const sources=rows("SELECT * FROM Sources WHERE active=1");let added=0,errors=[];for(const s of sources){try{const feed=await parser.parseURL(s.url);for(const item of (feed.items||[])){if(!item.link||!item.title)continue;const text=(item.contentSnippet||item.content||"").replace(/<[^>]*>/g," ").slice(0,1200);const hay=(item.title+" "+text).toLowerCase();let slug="it-ai";if(/грант|grant|funding/.test(hay))slug="grants";else if(/стажир|internship/.test(hay))slug="internships";else if(/хакатон|hackathon|olympiad/.test(hay))slug="hackathons";else if(/курс|образован|education/.test(hay))slug="education";else if(/конференц|conference|webinar/.test(hay))slug="events";else if(/стартап|startup/.test(hay))slug="startups";const cid=one("SELECT id FROM Categories WHERE slug=?",slug)?.id;const r=db.prepare("INSERT OR IGNORE INTO News(title,summary,content,source_name,source_url,category_id,published_at,demo) VALUES(?,?,?,?,?,?,?,0)").run(item.title,text,text,s.name,item.link,cid,item.isoDate||item.pubDate||new Date().toISOString());added+=r.changes;}db.prepare("UPDATE Sources SET last_checked=?,last_error=NULL WHERE id=?").run(new Date().toISOString(),s.id);}catch(e){const msg=String(e.message).slice(0,250);errors.push({source:s.name,error:msg});db.prepare("UPDATE Sources SET last_checked=?,last_error=? WHERE id=?").run(new Date().toISOString(),msg,s.id);}}return {added,errors,checked:sources.length};}
app.post("/api/admin/update",auth,admin,async(req,res)=>res.json(await updateFeeds()));
app.get("/api/admin/stats",auth,admin,(req,res)=>res.json({news:one("SELECT COUNT(*) n FROM News").n,events:one("SELECT COUNT(*) n FROM Events").n,sources:one("SELECT COUNT(*) n FROM Sources").n,drafts:one("SELECT COUNT(*) n FROM Drafts").n}));
app.get("/api/drafts",auth,admin,(req,res)=>res.json(rows("SELECT * FROM Drafts ORDER BY id DESC")));
app.post("/api/drafts/from-news/:id",auth,admin,(req,res)=>{const n=one("SELECT News.*,Categories.name category FROM News LEFT JOIN Categories ON Categories.id=News.category_id WHERE News.id=?",req.params.id);if(!n)return res.status(404).json({error:"Новость не найдена"});const facts=[n.summary||"Описание не указано",`Источник: ${n.source_name||"не указан"}`];const r=db.prepare("INSERT INTO Drafts(news_id,title,summary,facts,category,source_url,website_text,social_text) VALUES(?,?,?,?,?,?,?,?)").run(n.id,n.title,n.summary,JSON.stringify(facts),n.category,n.source_url,`${n.title}\\n\\n${n.summary||""}\\n\\nИсточник: ${n.source_url||""}`,`${n.title} — ${n.summary||""}`);res.json({id:r.lastInsertRowid,notice:"Создан черновик на основе данных новости. Это шаблон, не AI-генерация."});});
app.put("/api/drafts/:id",auth,admin,(req,res)=>{const d=req.body;db.prepare("UPDATE Drafts SET title=?,summary=?,website_text=?,social_text=?,status=? WHERE id=?").run(d.title,d.summary,d.website_text,d.social_text,d.status,req.params.id);res.json({ok:true});});
cron.schedule(process.env.RSS_CRON||"*/30 * * * *",()=>updateFeeds().catch(console.error));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");

app.use(express.static(clientDist));

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next(err);
  });
});
app.listen(port,()=>console.log(`TII IT Radar API: http://localhost:${port}`));
