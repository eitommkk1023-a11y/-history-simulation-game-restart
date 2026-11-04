import sys
src=sys.argv[1]; out=sys.argv[2]
s=open(src).read()
def block(id):
    t='<script id="%s" type="text/plain">'%id
    a=s.index(t)+len(t); b=s.index('</script>',a); return s[a:b]
exp="module.exports={faunaPlantFood, generateWorld, faunaMonthly, faunaHunt, faunaSummary, faunaClone, faunaDensity, faRng, faTotal, faJuveniles, faAdults, ANIMAL_SPECIES, FAUNA_TIER, faunaSuitability, ROCKS, ROCK_ASSEMBLAGES, buildRockInput, evolveRockTerrain, createStratigraphy, exposedRockId, rockHash};"
t=block('generator-src').replace("const tec = simulateTectonics(seed, progress);","const tec = simulateTectonics(seed, progress); globalThis.__tec = tec;")
open(out,'w').write("const self={postMessage(){}};\n"+t+"\n"+block('fauna-src')+"\n"+block('rock-src')+"\n"+exp+"\n")
