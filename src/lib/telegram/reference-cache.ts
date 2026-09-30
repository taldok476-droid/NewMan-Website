import "server-only";
import { getActiveEmployeeEntities, getActiveProjectEntities } from "./data";

const TTL_MS = 45_000;
type Cache<T>={value?:T;expiresAt:number;pending?:Promise<T>};
const projects:Cache<Awaited<ReturnType<typeof getActiveProjectEntities>>>={expiresAt:0};
const employees:Cache<Awaited<ReturnType<typeof getActiveEmployeeEntities>>>={expiresAt:0};

async function cached<T>(cache:Cache<T>,loader:()=>Promise<T>):Promise<T>{const now=Date.now();if(cache.value&&cache.expiresAt>now)return cache.value;if(cache.pending)return cache.pending;cache.pending=loader().then(value=>{cache.value=value;cache.expiresAt=Date.now()+TTL_MS;return value;}).finally(()=>{cache.pending=undefined;});return cache.pending;}
export const getCachedActiveProjects=()=>cached(projects,getActiveProjectEntities);
export const getCachedActiveEmployees=()=>cached(employees,getActiveEmployeeEntities);

export function clearReferenceCache(){projects.value=undefined;projects.expiresAt=0;employees.value=undefined;employees.expiresAt=0;}
