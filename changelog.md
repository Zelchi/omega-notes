# Histórico de atualizações

## v0.1.6

### Linux

- Restaurada a identificação da janela no lançador para o GNOME associar o Ômega Notes ao ícone do aplicativo.

## v0.1.5

### Interface

- Segurar Ctrl no modo de edição torna os links clicáveis para abrir notas e endereços externos, sem alterar o texto ou a posição do cursor.
- Ao soltar Ctrl, o destaque e as áreas clicáveis dos links são removidos imediatamente.

- Sugestões de notas centralizadas acima do cursor dentro de `[[...]]`, com filtro por título e seleção por mouse, setas, Enter ou Tab.
- Clique direito em imagens, áudios e vídeos agora ativa o reposicionamento, com confirmação, lixeira e redimensionador lado a lado em uma barra centralizada abaixo da mídia.
- Controles de reposicionamento permanecem visíveis mesmo quando o cursor sai da mídia.
- Removido o menu Anexar mídia do clique direito na nota; o catálogo continua disponível pela barra de edição.
- Clique direito na área de escrita preserva a posição do cursor de texto.
- Um segundo clique direito na mídia em reposicionamento confirma a posição.
- Cursor de texto em toda a área de escrita, inclusive nos espaços vazios, com exceção das mídias e controles.

### Desenvolvimento

- Dados das compilações de desenvolvimento separados em `Documentos/Ômega Notes Dev`, incluindo vaults, notas, mídias e arquivos temporários.

## v0.1.3

### Correções

- Atualizações disponíveis agora são informadas no botão das configurações. O download e a instalação só começam após o clique do usuário.

## v0.1.2

### Aparência

- Ícone atualizado com cantos arredondados e símbolo ômega menor.
- Atualizados os ícones da interface e dos instaladores.

## v0.1.1

### Correções

- Corrigida a falha de inicialização no Fedora com Wayland que exibia `Error 71 (Protocol error)`.
- O aplicativo agora desativa o renderizador DMABUF do WebKitGTK por padrão no Linux, permitindo abrir pelo menu ou pelo comando `omega-notes` sem configurar uma variável no terminal.
- Configurações explícitas de `WEBKIT_DISABLE_DMABUF_RENDERER` no ambiente continuam sendo respeitadas.

## v0.1.0

### Primeira versão

- Canvas visual com notas conectadas e bibliotecas separadas em vaults.
- Editor com salvamento automático, títulos, negrito, itálico, separadores e alinhamento de texto.
- Imagens, áudios e vídeos nas notas, com players integrados.
- Temas claro e escuro, idiomas português e inglês e opções de cursor.
- Distribuição para Windows, Ubuntu e Fedora, com atualização pelo GitHub.
