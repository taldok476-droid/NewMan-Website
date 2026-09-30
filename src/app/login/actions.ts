"use server";
import { createClient } from "@/lib/supabase/server"; import { redirect } from "next/navigation";
export async function login(formData:FormData){const supabase=await createClient();const email=String(formData.get("email")||"").trim();const password=String(formData.get("password")||"");const {error}=await supabase.auth.signInWithPassword({email,password});if(error)redirect(`/login?error=${encodeURIComponent("פרטי ההתחברות שגויים")}`);redirect("/dashboard");}
