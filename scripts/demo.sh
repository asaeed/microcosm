#!/bin/bash
# Smoke-director: plays a tiny scene against a running server. No AI required.
B=${1:-http://localhost:4380}
act() { curl -s -X POST "$B/act" -H 'Content-Type: application/json' -d "$1" > /dev/null; }

act '{"commands":[
 {"cmd":"spawn","creature":{"id":"preacher","name":"Br. Lumen","epithet":"P. fervens","prompt":"a preacher of the vent","chassis":"reactor","chassisSpec":null,"stains":{"body":"#4a3f96","accent":"#2e8b74"},"scale":1.1,"attributes":{"zeal":0.9},"pos":[0.35,0.45],"energy":0.8,"intent":{"verb":"idle"},"mood":"hopeful","tint":null}},
 {"cmd":"spawn","creature":{"id":"skeptic","name":"Sr. Quill","epithet":"S. dubium","prompt":"a sharp skeptic","chassis":"watch","chassisSpec":null,"stains":{"body":"#96504f","accent":"#a13a63"},"scale":1,"attributes":{"suspicion":0.8},"pos":[0.62,0.5],"energy":0.7,"intent":{"verb":"idle"},"mood":"wary","tint":null}},
 {"cmd":"chronicle","text":"Two specimens introduced to the slide. They regard one another."}]}'
sleep 4
act '{"commands":[
 {"cmd":"say","id":"preacher","text":"The vent provides, sister. Come and see."},
 {"cmd":"move-to","id":"preacher","target":[0.55,0.5]},
 {"cmd":"emote","id":"skeptic","mood":"agitated"}]}'
sleep 6
act '{"commands":[
 {"cmd":"say","id":"skeptic","text":"The vent is warm water and wishful thinking."},
 {"cmd":"build","structureId":"chapel","id":"preacher","name":"Vent Chapel","blob":[0.3,0.68,0.035]},
 {"cmd":"chronicle","text":"Br. Lumen lays the first membrane of a chapel near the east vent."}]}'
echo "demo scene played."
