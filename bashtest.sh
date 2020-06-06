#!/bin/bash

# PIPE3=$(mktemp -u)
# mkfifo $PIPE3
# exec 3<>$PIPE3

# PIPE4=$(mktemp -u)
# mkfifo $PIPE4
# exec 4<>$PIPE4
function sim(){
  echo one-a >&1 
  echo one-b >&1 
  echo two-a >&2
  echo two-b >&2
}

function viaFile(){
  echo viaFile
  local tmpf2=$(mktemp -u)
  local str1 str2
  { IFS= read -r -d '' str1; }< <(sim 2>$tmpf2)
  { IFS= read -r -d '' str2; }<$tmpf2
  echo  -e "str1=${str1}"
  echo  -e "str2=${str2}"
  rm $tmpf2
}

function viaFifoNoFD(){
  echo viaFifoNoFD
  #local fd
  #exec {fd}<> <(:)
  local tmpf2=$(mktemp -u)
  mkfifo $tmpf2
  local pid
  (
    while read str2 ; do
      echo "str2=${str2}"
    done<"$tmpf2"
    echo "subloop DONE"
  )&
  pid=$!
  { read -d '' str1; }< <(sim 2>$tmpf2)
  rm $tmpf2 # can be removed before read loop finishes 
  wait $pid
  echo "str1=${str1}"
  echo "main DONE"
}

# function randomString(){
#   head /dev/urandom | tr -dc A-Za-z0-9 | head -c 20
# } 

function viaFifoWithFD(){
  #set -x
  echo viaFifoWithFD
  #local fd
  #exec {fd}<> <(:)
  local tmpf2=$(mktemp -u)
  mkfifo $tmpf2
  exec 3<>$tmpf2
  local str1='',str2=''
  #local pid
  #pid=$!
  local rndstr="$RANDOM-$RANDOM-$RANDOM-$RANDOM-$RANDOM"
  # { IFS= read rndstr; }< <(sim) 
  { 
    IFS= read -r -d '' str1 ;
  }< <(sim 2>$tmpf2)
  echo -e "\n${rndstr}" >> $tmpf2
  #echo "reading fd 3"
  # { IFS= read -u3 str2; } # --- oops, this blocks
  { 
    local s
    while IFS= read -u3 s; do
      # echo "read $s"
      if [[ "${s}" == "${rndstr}" ]] ; then 
        str2=${str2%'\n'} # remove last newline, which is empty 
        break
      fi
      str2="${str2}${s}\n"
    done
  } 
  rm $tmpf2 
  echo -e "str1=${str1}"
  echo -e "str2=${str2}"
}


function viaCoproc(){
  echo viaCoproc
  coproc cat
  { read -d '' str1; }< <(sim 2>&${COPROC[1]})
  { read -d '' str2; }<&${COPROC[0]}
  echo "str1=${str1}"
  echo "str2=${str2}"
}

viaFile
#viaFifoNoFD
viaFifoWithFD

#tmpf1=$(mktemp)
#tmpf1=$(mktemp -u)
#mkfifo $tmpf1

#str1=''
#tmpf2=$(mktemp -u)
#tmpf2=$(mktemp -u)
#mkfifo $tmpf2

#echo $tmpf
#echo -n 'ONE ' > $tmpf1
#echo -n 'TWO ' > $tmpf2
#(tee -a $tmpf1 >/dev/null)< <( ((echo one >&1); (echo two >&2);) 2> >( tee -a $tmpf2 1>&2)) &
#(tee -a $tmpf1 >/dev/null)< <(sim 2>$tmpf2) &

#(echo -e "\ntmpf2 contents = $(cat $tmpf2)")&
#coproc cat
# { read -d '' str1; }< <(sim 2>$tmpf2)
# { read -d '' str2; }< <(cat   $tmpf2)
#echo -e "\ntmpf1 contents = $(cat $tmpf1)" ; rm $tmpf1
#echo "str1=${str1}"
#echo "str2=${str2}"

#echo -e "\ntmpf2 contents = $(cat $tmpf2)"
#rm $tmpf1
#rm $tmpf2
