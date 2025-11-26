// Lightweight validation helpers

function intParam(raw, { def=0, min=0, max=Number.MAX_SAFE_INTEGER } = {}) {
  const n = parseInt(raw,10);
  if(isNaN(n)) return def;
  return Math.min(Math.max(n,min),max);
}

function strEnum(raw, allowed, def){
  if(typeof raw !== 'string') return def;
  return allowed.includes(raw) ? raw : def;
}

function safeLimit(raw, def=100, min=1, max=10000){
  return intParam(raw,{def,min,max});
}

function isNonEmptyString(s){ return typeof s === 'string' && s.trim().length>0; }

module.exports = { intParam, strEnum, safeLimit, isNonEmptyString };
