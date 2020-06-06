#!/bin/bash

N=${1:-10}
doSleep=${2:-0} 

FIFO=/tmp/$$.fifo
mkfifo $FIFO
exec 3<>$FIFO
_EOF_="eof"

loop(){
	local iLast
    while read -u3 i ; do		
		RETVAL=$?
		if ((RETVAL!=0)) ; then
			echo "read returned $RETVAL, break"
			break
		fi
        echo "$i out"
		[[ "${i}" == "${_EOF_}" ]] && break
		#echo "i=${i}, iLast=${iLast}"
		[[ -n "${iLast}" ]] && ((iLast+1!=i)) && { echo ERROR; break; }
		iLast=$i
		[[ "$doSleep" == "0" ]] || sleep $doSleep
    done
}

#loop &
#LOOP_PID=$!
for i in $(seq 1 $N); do
    echo $i >&3
    echo "$i in"
done
echo ${_EOF_} >&3

loop

#wait $LOOP_PID
rm $FIFO
exec 3>&-  #close the input to fd 3
echo DONE
