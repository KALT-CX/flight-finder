import fs from "node:fs/promises";

const API_KEY = process.env.AVIATIONSTACK_API_KEY;
const OUTPUT_FILE = process.env.OUTPUT_FILE || "flights.json";
const API_URL = "https://api.aviationstack.com/v1/flights";
const PAGE_SIZE = 100;

const AIRPORT_COUNTRY = {
  PEK:"🇨🇳 China (Mainland)",PKX:"🇨🇳 China (Mainland)",PVG:"🇨🇳 China (Mainland)",SHA:"🇨🇳 China (Mainland)",CAN:"🇨🇳 China (Mainland)",SZX:"🇨🇳 China (Mainland)",XMN:"🇨🇳 China (Mainland)",FOC:"🇨🇳 China (Mainland)",HGH:"🇨🇳 China (Mainland)",NKG:"🇨🇳 China (Mainland)",NGB:"🇨🇳 China (Mainland)",WUH:"🇨🇳 China (Mainland)",XIY:"🇨🇳 China (Mainland)",CKG:"🇨🇳 China (Mainland)",TFU:"🇨🇳 China (Mainland)",CTU:"🇨🇳 China (Mainland)",TAO:"🇨🇳 China (Mainland)",CGO:"🇨🇳 China (Mainland)",CSX:"🇨🇳 China (Mainland)",HAK:"🇨🇳 China (Mainland)",WNZ:"🇨🇳 China (Mainland)",URC:"🇨🇳 China (Mainland)",KMG:"🇨🇳 China (Mainland)",
  NRT:"🇯🇵 Japan",HND:"🇯🇵 Japan",KIX:"🇯🇵 Japan",NGO:"🇯🇵 Japan",FUK:"🇯🇵 Japan",CTS:"🇯🇵 Japan",
  ICN:"🇰🇷 South Korea",PUS:"🇰🇷 South Korea",CJU:"🇰🇷 South Korea",
  TPE:"🇹🇼 Taiwan",KHH:"🇹🇼 Taiwan",RMQ:"🇹🇼 Taiwan",
  SIN:"🇸🇬 Singapore",BKK:"🇹🇭 Thailand",HKT:"🇹🇭 Thailand",MNL:"🇵🇭 Philippines",CEB:"🇵🇭 Philippines",
  HAN:"🇻🇳 Vietnam",SGN:"🇻🇳 Vietnam",DAD:"🇻🇳 Vietnam",KUL:"🇲🇾 Malaysia",PEN:"🇲🇾 Malaysia",
  CGK:"🇮🇩 Indonesia",DPS:"🇮🇩 Indonesia",SUB:"🇮🇩 Indonesia",PNH:"🇰🇭 Cambodia",KTI:"🇰🇭 Cambodia",
  DEL:"🇮🇳 India",BOM:"🇮🇳 India",BLR:"🇮🇳 India",MAA:"🇮🇳 India",HYD:"🇮🇳 India",KTM:"🇳🇵 Nepal",CMB:"🇱🇰 Sri Lanka",DAC:"🇧🇩 Bangladesh",
  LHR:"🇬🇧 United Kingdom",MAN:"🇬🇧 United Kingdom",LGW:"🇬🇧 United Kingdom",
  CDG:"🇫🇷 France",FRA:"🇩🇪 Germany",MUC:"🇩🇪 Germany",AMS:"🇳🇱 Netherlands",ZRH:"🇨🇭 Switzerland",
  MAD:"🇪🇸 Spain",BCN:"🇪🇸 Spain",MXP:"🇮🇹 Italy",FCO:"🇮🇹 Italy",HEL:"🇫🇮 Finland",BRU:"🇧🇪 Belgium",
  JFK:"🇺🇸 United States",BOS:"🇺🇸 United States",LAX:"🇺🇸 United States",SFO:"🇺🇸 United States",ORD:"🇺🇸 United States",DFW:"🇺🇸 United States",SEA:"🇺🇸 United States",
  YVR:"🇨🇦 Canada",YYZ:"🇨🇦 Canada",
  SYD:"🇦🇺 Australia",MEL:"🇦🇺 Australia",BNE:"🇦🇺 Australia",PER:"🇦🇺 Australia",ADL:"🇦🇺 Australia",AKL:"🇳🇿 New Zealand",
  DXB:"🇦🇪 United Arab Emirates",DOH:"🇶🇦 Qatar",RUH:"🇸🇦 Saudi Arabia",TLV:"🇮🇱 Israel",BAH:"🇧🇭 Bahrain",
  JNB:"🇿🇦 South Africa"
};


function regionForCountry(country) {
  const text=String(country||"").toLowerCase();
  if(text.includes("china")) return "CN";
  if(text.includes("japan")) return "JP";
  if(text.includes("south korea")) return "KR";
  if(text.includes("taiwan")) return "TW";
  if(["singapore","thailand","philippines","vietnam","malaysia","indonesia","cambodia"].some(x=>text.includes(x))) return "SEA";
  if(["india","nepal","sri lanka","bangladesh"].some(x=>text.includes(x))) return "SA";
  if(["united kingdom","france","germany","netherlands","switzerland","spain","italy","finland","belgium"].some(x=>text.includes(x))) return "EU";
  if(["united states","canada"].some(x=>text.includes(x))) return "NA";
  if(["australia","new zealand"].some(x=>text.includes(x))) return "OC";
  if(["united arab emirates","qatar","saudi arabia","israel","bahrain"].some(x=>text.includes(x))) return "ME";
  if(text.includes("south africa")) return "AF";
  return "OTHER";
}

if (!API_KEY) throw new Error("Missing AVIATIONSTACK_API_KEY.");

const time = value => String(value || "").match(/T(\d{2}:\d{2})/)?.[1] || "";
const mins = value => { const [h=0,m=0]=String(value||"00:00").split(":").map(Number); return h*60+m; };
const duration = value => `${Math.floor(value/60)}h ${String(value%60).padStart(2,"0")}m`;
const band = value => { const m=mins(value); return m>=360&&m<720?"Morning":m>=720&&m<1080?"Afternoon":m>=1080&&m<1320?"Evening":"Night"; };
const key = f => [f.flight_number,f.arrival_airport,f.departure_time,f.arrival_time].join("|");

function isCargo(raw, flightNumber) {
  const number = Number(flightNumber.replace(/^[A-Z]+/, ""));
  const iata = String(raw.aircraft?.iata || "").toUpperCase();
  const icao = String(raw.aircraft?.icao || "").toUpperCase();
  const reg = String(raw.aircraft?.registration || "").toUpperCase();
  const cargoNumber = (number>=1&&number<=99)||(number>=2000&&number<=2099)||(number>=3000&&number<=3299);
  const freighter = /74[48].*F/.test(iata)||/B74[48].*F/.test(icao)||reg.startsWith("B-LI")||reg.startsWith("B-LJ");
  return cargoNumber || freighter;
}

async function fetchAll() {
  const rows=[]; let offset=0;
  while (true) {
    const url=new URL(API_URL);
    url.searchParams.set("access_key",API_KEY);
    url.searchParams.set("dep_iata","HKG");
    url.searchParams.set("airline_iata","CX");
    url.searchParams.set("limit",String(PAGE_SIZE));
    url.searchParams.set("offset",String(offset));
    console.log(`Fetching CX passenger candidates from HKG, offset ${offset}...`);
    const response=await fetch(url);
    const payload=await response.json();
    if (!response.ok||payload.error) throw new Error(JSON.stringify(payload.error||{status:response.status}));
    const page=Array.isArray(payload.data)?payload.data:[];
    rows.push(...page);
    const count=Number(payload.pagination?.count??page.length);
    const total=Number(payload.pagination?.total??rows.length);
    if (!count||offset+count>=total) break;
    offset+=count;
  }
  return rows;
}


function localScheduleToUtc(value, timeZone) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match || !timeZone) return NaN;
  const [, y, mo, d, h, mi, sec = "00"] = match;
  const wallAsUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
    }).formatToParts(new Date(guess));
    const get = type => Number(parts.find(part => part.type === type)?.value || 0);
    const rendered = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    guess += wallAsUtc - rendered;
  }
  return guess;
}

function localDayOffset(departureValue, arrivalValue) {
  const depDate = String(departureValue || "").slice(0, 10);
  const arrDate = String(arrivalValue || "").slice(0, 10);
  if (!depDate || !arrDate) return 0;
  return Math.round((Date.parse(`${arrDate}T00:00:00Z`) - Date.parse(`${depDate}T00:00:00Z`)) / 86400000);
}

function normalize(raw, metadata) {
  const flight=String(raw.flight?.iata||"").replace(/\s+/g,"").toUpperCase();
  const dep=String(raw.departure?.iata||"").toUpperCase();
  const airline=String(raw.airline?.iata||"").toUpperCase();
  const airport=String(raw.arrival?.iata||"").toUpperCase();
  if(dep!=="HKG"||airline!=="CX"||!/^CX\d{3}$/.test(flight)||!airport) return {skip:"other"};
  if(isCargo(raw,flight)) return {skip:"cargo",flight};
  const departureValue=raw.departure?.scheduled;
  const arrivalValue=raw.arrival?.scheduled;
  const departure=time(departureValue), arrival=time(arrivalValue);
  if(!departure||!arrival) return {skip:"missing-time"};
  const departureUtc=localScheduleToUtc(departureValue,raw.departure?.timezone);
  const arrivalUtc=localScheduleToUtc(arrivalValue,raw.arrival?.timezone);
  const flightMinutes=Math.round((arrivalUtc-departureUtc)/60000);
  if(!Number.isFinite(flightMinutes)||flightMinutes<=0||flightMinutes>1200) return {skip:"invalid-duration",flight};
  const dayOffset=localDayOffset(departureValue,arrivalValue);
  const meta=metadata.get(airport)||{};
  const country=AIRPORT_COUNTRY[airport]||meta.country||"Other";
  return {value:{
    country,region:regionForCountry(country),
    arrival_city:meta.arrival_city||`${String(raw.arrival?.airport||airport).trim()} (${airport})`,
    arrival_airport:airport,flight_number:flight,departure_time:departure,arrival_time:arrival,
    duration:duration(flightMinutes),flight_duration_minutes:flightMinutes,
    duty_duration_minutes:flightMinutes+115,
    departure_band:band(departure),arrival_next_day:dayOffset>0,arrival_day_offset:dayOffset
  }};
}

async function main(){
  const original=JSON.parse(await fs.readFile(OUTPUT_FILE,"utf8"));
  const removedExisting=original.filter(f=>!/^CX\d{3}$/.test(String(f.flight_number||"")));
  const existing=original.filter(f=>/^CX\d{3}$/.test(String(f.flight_number||""))).map(f=>{
    const country=AIRPORT_COUNTRY[f.arrival_airport]||f.country||"Other";
    return {...f,country,region:regionForCountry(country)};
  });
  const metadata=new Map(existing.map(f=>[f.arrival_airport,{country:f.country,arrival_city:f.arrival_city}]));
  const raw=await fetchAll(); const accepted=[]; const cargo=[]; const invalidDuration=[];
  for(const item of raw){const result=normalize(item,metadata);if(result.value)accepted.push(result.value);if(result.skip==="cargo")cargo.push(result.flight);if(result.skip==="invalid-duration")invalidDuration.push(result.flight);}
  const distinct=[...new Map(accepted.map(f=>[key(f),f])).values()];
  const merged=new Map(existing.map(f=>[key(f),f])); const added=[]; const updated=[];
  for(const f of distinct){
    const k=key(f); const old=merged.get(k);
    if(!old){merged.set(k,f);added.push(f);continue;}
    if(old.flight_duration_minutes!==f.flight_duration_minutes||old.country!==f.country||old.region!==f.region){
      merged.set(k,{...old,...f});updated.push(f);
    }
  }
  const final=[...merged.values()].sort((a,b)=>a.departure_time.localeCompare(b.departure_time)||a.arrival_airport.localeCompare(b.arrival_airport)||a.flight_number.localeCompare(b.flight_number));
  console.log(`API records: ${raw.length}`);console.log(`Cargo records excluded: ${cargo.length}`);console.log(`Passenger records: ${distinct.length}`);console.log(`Existing non-CX3 records removed: ${removedExisting.length}`);console.log(`Invalid durations excluded: ${invalidDuration.length}`);console.log(`New records: ${added.length}`);console.log(`Existing records corrected: ${updated.length}`);console.log(`Final records: ${final.length}`);
  if(cargo.length) console.log(`Excluded cargo: ${[...new Set(cargo)].join(", ")}`);
  if(!added.length&&!updated.length&&!removedExisting.length){console.log("No passenger timetable differences found. flights.json unchanged.");return;}
  for(const f of added) console.log(`ADD ${f.flight_number} HKG-${f.arrival_airport} ${f.departure_time}-${f.arrival_time} ${f.country}`);
  for(const f of updated) console.log(`FIX ${f.flight_number} HKG-${f.arrival_airport}: flight ${f.duration}, duty ${duration(f.duty_duration_minutes)}`);
  const longHaul=final.filter(f=>["EU","NA","OC","ME","AF"].includes(f.region));
  const audit=longHaul.map(f=>({flight_number:f.flight_number,arrival_airport:f.arrival_airport,region:f.region,departure_time:f.departure_time,arrival_time:f.arrival_time,flight_duration:duration(f.flight_duration_minutes||0),duty_duration:duration(f.duty_duration_minutes||0),status:(f.flight_duration_minutes>=240&&f.flight_duration_minutes<=1200)?"OK":"CHECK"}));
  await fs.writeFile("flight-time-audit.json",`${JSON.stringify(audit,null,2)}\n`);
  await fs.writeFile("flights-meta.json",`${JSON.stringify({updated_at:new Date().toISOString(),source:"Aviationstack /v1/flights",records:final.length,long_haul_checked:audit.length},null,2)}\n`);
  await fs.writeFile(`${OUTPUT_FILE}.tmp`,`${JSON.stringify(final,null,2)}\n`);
  await fs.rename(`${OUTPUT_FILE}.tmp`,OUTPUT_FILE);
  console.log("flights.json updated successfully.");
}

main().catch(error=>{console.error(error.message);process.exit(1);});
