export const statusLabel = { active:"פעיל", inactive:"לא פעיל", paused:"מושהה", completed:"הסתיים" } as Record<string,string>;
export const formatDate = (value:string) => new Intl.DateTimeFormat("he-IL").format(new Date(`${value}T12:00:00`));
export const monthBounds = (month:string) => { const [y,m]=month.split("-").map(Number); const end=new Date(y,m,0).getDate(); return [`${month}-01`,`${month}-${String(end).padStart(2,"0")}`] as const; };
