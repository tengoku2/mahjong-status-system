import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { REST, Routes } from "discord.js";
import type { APIGuildMember, APIMessage } from "discord.js";
import { prisma } from "../src/prisma.js";
import { hashId, parseImport } from "../src/mortal-nanikiru-domain.js";
import { mortalAnswerStatus, problemEmbed } from "../src/mortal-nanikiru.js";
import { MADOROMI_GUILD_ID } from "../src/guild-rules.js";

const apply = process.argv.includes("--apply");
const inputPath = process.argv[2];
assert(inputPath && !inputPath.startsWith("--"), "Pass a private context JSON file.");
try {
  const input=parseImport(JSON.parse(await readFile(inputPath,"utf8")));
  const context=new Map(input.reviews.flatMap(r=>r.decisions.map(d=>[hashId(`${r.id}:${d.anchor}:${d.entry}`),d] as const)));
  const candidates=await prisma.mortalCandidate.findMany();
  for(const p of candidates.filter(p=>p.messageId))assert(context.has(p.id),"A posted question is missing its original context.");
  const changed=candidates.filter(p=>{
    const d=context.get(p.id), previous=p.data as any;
    if(!d)return false;
    assert(d.dora?.length,"Missing dora in verified context.");
    assert.deepEqual(previous.hand,d.hand,"Hand changed; do not replace historical context.");
    assert.deepEqual(previous.melds,d.melds,"Melds changed; do not replace historical context.");
    return JSON.stringify(previous.dora)!==JSON.stringify(d.dora);
  });
  console.log({contextChanges:changed.length,postedQuestions:candidates.filter(p=>p.messageId).length,apply});
  if(!apply)process.exitCode=0;
  else {
    await writeFile(".private/mortal-nanikiru-context-before.json",JSON.stringify(changed.map(p=>({id:p.id,dora:(p.data as any).dora??null})),null,2),{encoding:"utf8",flag:"wx"}).catch((e)=>{if(e.code!=="EEXIST")throw e;});
    for(let offset=0;offset<changed.length;offset+=100){
      const chunk=changed.slice(offset,offset+100);
      const rows=Prisma.join(chunk.map(p=>Prisma.sql`(${p.id}, ${JSON.stringify(context.get(p.id)!.dora)}::jsonb, ${JSON.stringify(context.get(p.id)!.hand)}::jsonb)`));
      await prisma.$executeRaw`UPDATE "MortalCandidate" AS c SET "data"=jsonb_set(c."data",'{dora}',v.dora) FROM (VALUES ${rows}) AS v(id,dora,hand) WHERE c.id=v.id AND c."data"->'hand'=v.hand`;
    }
    const deployment=JSON.parse(await readFile(".private/mortal-koyeb-final-deployment.json","utf8"));
    const token=deployment.definition.env.find((e:any)=>e.key==="DISCORD_TOKEN")?.value;
    assert(token,"Use the saved private deployment configuration.");
    const rest=new REST({version:"10"}).setToken(token);
    const self=await rest.get(Routes.user()) as {id:string};
    let edited=0;
    for(const p of await prisma.mortalCandidate.findMany({where:{messageId:{not:null},channelId:{not:null}}})){
      const channel=await rest.get(Routes.channel(p.channelId!)) as {guild_id:string};
      assert.equal(channel.guild_id,MADOROMI_GUILD_ID);
      const message=await rest.get(Routes.channelMessage(p.channelId!,p.messageId!)) as APIMessage;
      assert.equal(message.author.id,self.id);
      await writeFile(`.private/mortal-nanikiru-message-${p.id}-before.json`,JSON.stringify(message,null,2),{encoding:"utf8",flag:"wx"}).catch(e=>{if(e.code!=="EEXIST")throw e;});
      const closed=Boolean(p.closedAt || p.closesAt && p.closesAt<=new Date());
      const distribution=closed?message.embeds[0]?.description?.match(/回答 \d+人[\s\S]*/)?.[0]:undefined;
      const answers=await prisma.mortalAnswer.findMany({where:{candidateId:p.id},orderBy:[{createdAt:"asc"},{interactionId:"asc"}]});
      const names=await Promise.all([...new Set(answers.map(a=>a.userId))].map(async id=>{
        const member=await rest.get(Routes.guildMember(MADOROMI_GUILD_ID,id)).catch(()=>null) as APIGuildMember|null;
        return member?.nick??member?.user?.global_name??member?.user?.username??`User-${id.slice(-4)}`;
      }));
      await rest.patch(Routes.channelMessage(p.channelId!,p.messageId!),{body:{embeds:[problemEmbed(p,closed,distribution,names).toJSON()],allowed_mentions:{parse:[]}}});
      if(p.resultMessageId && p.resultChannelId){
        const result=await rest.get(Routes.channelMessage(p.resultChannelId,p.resultMessageId)) as APIMessage;
        assert.equal(result.author.id,self.id);
        await rest.patch(Routes.channelMessage(p.resultChannelId,p.resultMessageId),{body:{embeds:result.embeds.map(embed=>({...embed,footer:{text:mortalAnswerStatus(names)}})),allowed_mentions:{parse:[]}}});
      }
      edited++;
    }
    console.log({contextUpdated:changed.length,existingQuestionsEdited:edited,newMessagesPosted:0});
  }
} finally { await prisma.$disconnect(); }
