# Preserve o ambiente de login do usuário e a configuração da CLI antes de definir o prompt.
if [[ -r /etc/profile ]]; then
    source /etc/profile
fi
for omega_profile in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
    if [[ -r "$omega_profile" ]]; then
        source "$omega_profile"
        break
    fi
done
unset omega_profile
unset PROMPT_COMMAND
PS1='\u@\h: '
PS2='> '
