
if [[ $1 == '--help' ]] ; then
cat <<'_EOF'
$1 : _${1}_completion will be name of bash completion function, (no dashes) 
$2 : completion trigger command, mapped by 
     "complete -F _${1}_completion ${2:-${1}}"
     default is $1
$3 : interpreter + called prog, e.g., "node --inspect-brk tset-parse-token.js"
     default is $2
     when [[ $3 -ne $2 ]] , add alias $2=$3,   
example:
  source gencomp testParseToken_i test-parse-token-i "node --inspect-brk test-parse_token.js"
_EOF
return
fi
## todo: add 3 default
Comp_CompFnName="_${1}_completion"
Comp_UserCmd="${2:-${1}}"
Comp_TrueCmd="${3:-${Comp_UserCmd}}"

echo Comp_CompFnName="${Comp_CompFnName}"
echo Comp_UserCmd="${Comp_UserCmd}"
echo Comp_TrueCmd="${Comp_TrueCmd}"

#  read -ra COMPREPLY <<< \
#    \$(${Comp_TrueCmd} completion \${COMP_CWORD} \${COMP_WORDS[@]} 2>/dev/null);
#compopt +o filenames ${Comp_UserCmd} ;
#notify-send "\${COMP_CWORD} \${COMP_WORDS[*]}" "\${COMPREPLY[*]}" ;





complete -r ${Comp_UserCmd}
unset -f ${Comp_CompFnName}
read -r -d  '' Comp_FuncTxt <<_EOF
function ${Comp_CompFnName} {
  local PASSED_COMP_OPTS=(), compopt_rtn='not set' ;
  logger -t "${Comp_CompFnName}" -- "COMP_CWORD=\${COMP_CWORD}, COMP_WORDS=\${COMP_WORDS[*]}" 
  while true; do 
    read -ra COMPREPLY 
    logger -t "${Comp_CompFnName}" -- "COMPREPLY=\${COMPREPLY[*]}"
    read -ra PASSED_COMP_OPTS
    logger -t "${Comp_CompFnName}" -- "#PASSED_COMP_OPTS=\${#PASSED_COMP_OPTS[@]}" 
    logger -t "${Comp_CompFnName}" -- "PASSED_COMP_OPTS=\${PASSED_COMP_OPTS[*]}"
    break
  done< <(${Comp_TrueCmd} completion \${COMP_CWORD} \${COMP_WORDS[@]} 2>/dev/null)   
  if [[ \${#PASSED_COMP_OPTS[@]} -ne 0 ]] ; then 
    compopt \${PASSED_COMP_OPTS[*]} ${Comp_UserCmd}
    compopt_rtn=\$?
    logger -t "${Comp_CompFnName}" -- "compopt returned \${compopt_rtn}"
  fi
  return 0
}
_EOF
echo "Comp_FuncTxt is\n"
echo "${Comp_FuncTxt}" | cat -v
eval "${Comp_FuncTxt}" 
#declare -f ${Comp_CompFnName}
complete -F ${Comp_CompFnName} "${Comp_UserCmd}"
compopt -o bashdefault -o default +o dirnames +o filenames +o nospace +o plusdirs "${Comp_UserCmd}"
[[ "${Comp_UserCmd}" == "${Comp_TrueCmd}" ]] \
  || alias ${Comp_UserCmd}="${Comp_TrueCmd}"
unset Comp_CompFnName
unset Comp_UserCmd
unset Comp_TrueCmd
unset Comp_FuncTxt
