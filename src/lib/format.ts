export const statusLabel = { active:"פעיל", inactive:"לא פעיל", paused:"מושהה", completed:"הסתיים" } as Record<string,string>;
export const formatDate = (value:string) => new Intl.DateTimeFormat("he-IL").format(new Date(`${value}T12:00:00`));
