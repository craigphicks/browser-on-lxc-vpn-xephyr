#!/bin/bash


#(
#  read -r -d '' a1;
while true 
do
  read -ra a1 ; 
  read -ra a2 ;
  break ;
done< <( echo 'a b c' ; echo 'x y z' ; ) ;

echo ${a1}
echo ${a2}
echo ${a1[*]}
echo ${a2[*]}
