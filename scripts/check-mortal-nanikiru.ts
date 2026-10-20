import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

// Use only a newly-created disposable schema. Existing application tables are untouched.
const schema = `mortal_nanikiru_test_${Date.now()}`;
assert.match(schema, /^mortal_nanikiru_test_\d+$/);
const admin = new PrismaClient();
let created = false;
let testClient: PrismaClient | undefined;
try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  created = true;
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  const { prisma } = await import("../src/prisma.js");
  testClient = prisma;
  const sql = await readFile("prisma/migrations/20261020000000_add_mortal_nanikiru/migration.sql", "utf8");
  for (const statement of sql.split(";").filter(s => s.trim())) await prisma.$executeRawUnsafe(statement);
  const { registerMortalImport, selectMortalManually } = await import("../src/mortal-nanikiru.js");
  const now = new Date();
  const hand = ["4m", "4m", "5p", "6p", "7p", "3s", "4s", "8s", "8s", "8s", "3m"];
  function review(id: string, days: number, gaps: number[]) {
    return { id: id.repeat(64), playedAt: new Date(now.getTime()-days*86400000).toISOString(), decisions:gaps.map((gap,i)=>({
      anchor:"kyoku-6-0",entry:i+1,round:"南3局",turn:2,hand,melds:[["5m","6m","7m"]],actual:"打 4m",seat:1,startingScores:[25000,25000,25000,25000],
      actions:["3m","4m","8s","7p","4s","6p","5p","3s"].map((t,j)=>({action:`打 ${t}`,q:j===0?0:j===1?-gap:-3-j}))
    })) };
  }
  const input={baseline:false,reviews:[review("a",3,[1.2,.95,.6]),review("b",1,[.9,.8,.4]),review("c",0,[.75,.65,.5])]};
  const [first,second]=await Promise.all([registerMortalImport(input),registerMortalImport(input)]);
  assert.equal(first.batchId,second.batchId);
  assert.equal(await prisma.mortalCandidate.count(),9);
  assert.equal(await prisma.mortalCandidate.count({where:{batchId:{not:null}}}),0);
  const [requested,repeated]=await Promise.all([selectMortalManually("synthetic-request",now),selectMortalManually("synthetic-request",now)]);
  assert.equal(requested,repeated);
  const issued=await prisma.mortalCandidate.findMany({where:{batchId:requested},orderBy:{gap:"desc"}});
  assert.deepEqual(issued.map(c=>c.gap),[1.2,.95,.9]);
  await prisma.mortalCandidate.update({where:{id:issued[0].id},data:{issuedAt:now,messageId:"synthetic-message",closesAt:new Date(now.getTime()+86400000)}});
  for(const [interactionId,tile] of [["synthetic-answer1","4m"],["synthetic-answer2","3m"]]) await prisma.mortalAnswer.create({data:{interactionId,candidateId:issued[0].id,userId:"synthetic-user",tile}});
  await registerMortalImport(input);
  assert.equal(await prisma.mortalAnswer.count(),2);
  assert.equal((await prisma.mortalCandidate.findUniqueOrThrow({where:{id:issued[0].id}})).messageId,"synthetic-message");
  const fallback=await selectMortalManually("synthetic-fallback",new Date(now.getTime()+10*86400000));
  assert.deepEqual((await prisma.mortalCandidate.findMany({where:{batchId:fallback},orderBy:{gap:"desc"}})).map(c=>c.gap),[.75,.65,.5]);
  assert.equal(await prisma.mortalCandidate.count({where:{batch:{mode:"request"},issuedAt:null}}),5);
  console.log("PostgreSQL integration passed: import without posts, concurrent requests, 72-hour selection, old latest fallback and history.");
} finally {
  await testClient?.$disconnect();
  if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
}
