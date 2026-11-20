# Parte 1 — base de áudio e preparação para gravações

Entrega para projeto pessoal não comercial. Não foram abertos, recortados, convertidos ou integrados arquivos de verstappen_onboard.wav. Não foi executado o script prepare-audio.

## Alterações

- engine-approval.json agora contém cinco bandas com id e nativeRpm, além de offThrottleRpm. O player e os rivais usam essa calibração.
- Validação de aprovação, origem, licença, ordem das bandas e RPM positivos. status.engineIssues explica pendências; engineReady continua falso enquanto faltam gravações e aprovação.
- Mistura de RPM reaproveita buffers de saída do player e dos rivais. Isso reduz alocações, mas não significa zero alocação em todo o áudio ou nas superfícies.
- Carregamento com até três tarefas simultâneas, preferência por WAV sobre OGG, cancelamento no descarte e limites de arquivo/banco. A verificação de memória ocorre após decodificar cada arquivo: o pico temporário de decodificação ainda precisa ser medido no navegador.
- Loops disponíveis são preparados antes de status.loading ficar falso. Categorias pendentes continuam silenciosas.
- Ganhos de vozes ativas não são zerados a cada quadro; vozes que deixaram de ser usadas recebem fade de saída.
- Diagnóstico: status.loading, errors, engineIssues, decodedBytes e activeLoops em window.interlagosAudio.status.

## Sua proposta de onboard

A edição manual pode fornecer matéria sonora útil, mas ainda depende de avaliar a gravação: ausência de rádio, distorção e trocas no trecho, RPM nativo e emendas contínuas. Não é possível garantir sua adequação pelo nome do arquivo. Sons de troca extraídos de onboard normalmente contêm o motor junto; adicionar esses sons a um motor contínuo pode duplicar o transiente.

O script atual NÃO normaliza nem exporta OGG: converte para WAV mono PCM 16 bits/48kHz, preservando a dinâmica. O comando suportado é npm run audio:prepare, com FFmpeg instalado. Não executar antes de selecionar e editar as fontes. Se houver WAV e OGG de mesmo nome, esta versão prefere WAV.

Copiar arquivos não libera automaticamente o motor: as seis categorias precisam carregar, a calibração deve ser válida e a aprovação/origem/licença precisam estar preenchidas. Uma gravação antiga ou de RPM desconhecido não deve ser declarada F1 2026 apenas por renomear seus cortes.

Uso não comercial não documenta sozinho autorização para incorporar ou distribuir uma gravação. A origem deste WAV não foi avaliada nesta etapa.

## Escopo restante

Esta parte conclui uma etapa de infraestrutura, não todo o plano nem o banco final de som. Motor real e efeitos ausentes continuam pendentes. Síntese opcional não foi reativada sem sua escolha explícita. Larguras, física a 180Hz, mapa unificado, ambiente, estruturas e calibração auditiva ficam para as próximas partes.

## Verificação

npm run lint, npm test, npm run build e npm run check:geom. A suíte tem 35 testes. Não foi feita avaliação auditiva no navegador nem aprovação de RPM de gravações reais.

Para executar: npm ci e npm run dev. Consulte LEIA-ME-AUDIO.md para as categorias e os nomes de arquivo. Para saber o comportamento que mudou nesta entrega, este documento prevalece sobre os trechos antigos de preparação de áudio.
