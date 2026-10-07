import "server-only";

type SendMessageOptions = {
  parseMode?: "HTML";
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
};

type TelegramErrorBody={ok?:boolean;error_code?:number;description?:string};

async function telegramRequest(method:string,init:RequestInit):Promise<void>{
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{...init,cache:"no-store"});
  const raw=typeof response.text==="function"?await response.text():"";
  let body:TelegramErrorBody|null=null;
  if(raw){try{body=JSON.parse(raw) as TelegramErrorBody;}catch{body=null;}}
  if(response.ok&&body?.ok!==false)return;
  const safeResponse=body?{ok:body.ok,error_code:body.error_code,description:body.description?.slice(0,500)}:{description:raw.slice(0,500)||"Empty Telegram response"};
  console.error("Telegram API request failed",{method,status:response.status,response:safeResponse});
  throw new Error(`Telegram ${method} failed with status ${response.status}${body?.error_code?` (${body.error_code})`:""}`);
}

function jsonRequest(body:Record<string,unknown>):RequestInit{return{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)};}

export async function sendMessage(chatId:number,text:string,options:SendMessageOptions={}):Promise<void>{await telegramRequest("sendMessage",jsonRequest({chat_id:chatId,text,parse_mode:options.parseMode,disable_web_page_preview:true,reply_markup:options.inlineKeyboard?{inline_keyboard:options.inlineKeyboard}:undefined}));}
export async function editMessageText(chatId:number,messageId:number,text:string,options:SendMessageOptions={}):Promise<void>{await telegramRequest("editMessageText",jsonRequest({chat_id:chatId,message_id:messageId,text,parse_mode:options.parseMode,disable_web_page_preview:true,reply_markup:{inline_keyboard:options.inlineKeyboard??[]}}));}
export async function removeInlineKeyboard(chatId:number,messageId:number):Promise<void>{await telegramRequest("editMessageReplyMarkup",jsonRequest({chat_id:chatId,message_id:messageId,reply_markup:{inline_keyboard:[]}}));}

export async function editCallbackMessage(chatId:number,messageId:number,text:string,options:SendMessageOptions={}):Promise<"edited"|"fallback">{
  try{await editMessageText(chatId,messageId,text,options);return"edited";}
  catch{
    try{await removeInlineKeyboard(chatId,messageId);}catch{/* Already logged; continue to one fallback message. */}
    await sendMessage(chatId,text,options);
    return"fallback";
  }
}

export async function answerCallbackQuery(callbackQueryId:string,text?:string):Promise<void>{await telegramRequest("answerCallbackQuery",jsonRequest({callback_query_id:callbackQueryId,text}));}
export async function sendChatAction(chatId:number,action:"typing"="typing"):Promise<void>{await telegramRequest("sendChatAction",jsonRequest({chat_id:chatId,action}));}
export async function sendDocument(chatId:number,data:Buffer,filename:string):Promise<void>{const bytes=new Uint8Array(data.byteLength);bytes.set(data);const form=new FormData();form.set("chat_id",String(chatId));form.set("document",new Blob([bytes.buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),filename);await telegramRequest("sendDocument",{method:"POST",body:form});}
