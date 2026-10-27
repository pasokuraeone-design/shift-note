import {WEEKDAYS,MASK_LABELS,weekday,shortDate} from './core.mjs';
export function importCalendarMarkup(days){
  if(!days.length)return '';
  const first=days[0].date,offset=weekday(first),padding=(7-(offset+days.length)%7)%7;
  return `<div class="import-calendar-title">${Number(first.slice(0,4))}年${Number(first.slice(5,7))}月</div><div class="import-calendar-grid">${WEEKDAYS.map((w,i)=>`<div class="import-weekday ${i===5?'sat':i===6?'sun':''}">${w}</div>`).join('')}${'<div class="import-blank" aria-hidden="true"></div>'.repeat(offset)}${days.map((r,i)=>`<label class="import-day ${r.mask===null?'unresolved':r.mask?'off-request':''}"><span class="import-date ${weekday(r.date)===5?'sat':weekday(r.date)===6?'sun':''}">${Number(r.date.slice(8))}<small>（${WEEKDAYS[weekday(r.date)]}）</small></span><select data-import-day="${i}" aria-label="${shortDate(r.date)}の希望休"><option value="unknown" ${r.mask===null?'selected':''}>未判定・要確認</option>${Object.entries(MASK_LABELS).map(([v,l])=>`<option value="${v}" ${Number(v)===r.mask?'selected':''}>${l}</option>`).join('')}</select></label>`).join('')}${'<div class="import-blank" aria-hidden="true"></div>'.repeat(padding)}</div>`;
}
