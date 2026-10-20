# Keep the user's login environment and CLI configuration before setting our prompt.
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
