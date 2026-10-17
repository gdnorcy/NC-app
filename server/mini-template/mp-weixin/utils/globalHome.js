"use strict";exports.buildGlobalHomeRedirect=function(t,e,i){if(!t)return"";const r=t+(e?(t.includes("?")?"&tid=":"?tid=")+e:"");return"/"+String(i||"").replace(/^\//,"")===t.split("?")[0]?"":r};
