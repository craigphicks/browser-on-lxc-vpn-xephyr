#!/bin/bash

N=${1:-10}
doSleep=${2:-0} 

FIFO=/tmp/$$.fifo
mkfifo $FIFO

loop(){
	local iLast
    while read i ; do
        echo "$i out"
		[[ -n "${iLast}" ]] && ((iLast+1!=i)) && { echo ERROR; break; }
		iLast=$i
		[[ "$doSleep" == "0" ]] || sleep $doSleep
    done<"${FIFO}"
}

loop &
LOOP_PID=$!
for i in $(seq 1 $N); do
    echo $i > $FIFO
    echo "$i in"
done

wait $LOOP_PID
if [[ -p  "${FIFO}" ]] ; then
	rm "${FIFO}"
else
	echo "pipe ${FIFO} already removed"
fi
echo "DONE"
