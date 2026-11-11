# Player lo-fi

## Ciclo de vida

Os controles aparecem como seção no topo do painel Pomodoro, mas o player de áudio é montado no nível do app e permanece ativo enquanto o app estiver aberto. A lista contém somente as estações fixas Lush, Salad, Blender e Fluid. Ao iniciar o app, busca os metadados SomaFM para exibir a faixa atual do canal selecionado. Falhas ou 15 segundos sem progresso avançam para a próxima estação fixa ainda não tentada.

O endereço de cada estação não é carregado diretamente pelo WebView: o backend valida HTTPS, resolve o host rejeitando qualquer endereço não público e aplica a mesma regra a redirecionamentos. O áudio passa pelo servidor local autenticado por token; a CSP só permite mídia local. Os metadados vêm da SomaFM; a faixa atual de cada canal é associada pelo ID do canal, enquanto o nome exibido usa o rótulo curto configurado no app.

Fechar o painel Pomodoro não interrompe a reprodução. O áudio é encerrado ao fechar o app. O volume começa em 40% e não é persistido. Enquanto qualquer áudio ou vídeo de nota está tocando, o volume do player lo-fi é reduzido a zero; volta ao volume escolhido quando todos param.

O menu de contexto da bandeja permite mutar/desmutar a música sem parar a reprodução e avançar para a próxima estação. O estado de mute é temporário e independente do volume escolhido.

## Falhas e cobertura

Falhas ao buscar diretório ou metadados não impedem o uso das fontes disponíveis. Se todas as fontes de reprodução falharem, o painel informa o estado de erro. O diretório pode conter estações cuja checagem de saúde está desatualizada; por isso, a reprodução continua pela lista completa de candidatas selecionadas e pelos fallbacks estáticos. Os testes em `lofi-player.test.mjs` cobrem validação de fontes, metadados e fallback; `note-media-playback.test.mjs` cobre o estado compartilhado usado para reduzir o volume; `production-features.test.mjs` protege o player global e os controles no Pomodoro.

## Código

- [Lista e validação das fontes](../../apps/desktop/frontend/src/features/lofi-player/model/sources.ts)
- [Repositório e comando da bridge](../../apps/desktop/frontend/src/features/lofi-player/api/music.repository.ts)
- [Player global e ciclo de reprodução](../../apps/desktop/frontend/src/features/lofi-player/model/player.tsx)
- [Controles no Pomodoro](../../apps/desktop/frontend/src/features/lofi-player/ui/lofi-player-panel/index.tsx)
- [Validação de destino e proxy local](../../apps/desktop/backend/src/web/client.rs), [registro da URL](../../apps/desktop/backend/src/media/commands.rs), [servidor de mídia](../../apps/desktop/backend/src/media/stream.rs)
- [Coordenação com players das notas](../../apps/desktop/frontend/src/shared/lib/note-media-playback.ts)
- [Testes das fontes e fallback](../../apps/desktop/frontend/test/lofi-player.test.mjs)
- [Teste de coordenação de áudio](../../apps/desktop/frontend/test/note-media-playback.test.mjs)
