# Interlagos · cenário e áudio gravado

## Cenário

Sete arquibancadas com fundação apoiada na malha, incluindo três novos pontos aproximados na Reta Oposta, miolo e subida final. Os módulos reaproveitam a geometria já usada no jogo. Os setores A e D na prévia continuam usando os módulos exportados do Blender. Os novos alambrados seguem a base das barreiras existentes, em cinco setores ao longo da volta. Os postes são instanciados e a grade usa uma única geometria de linhas. As colisões continuam compartilhando o traçado das barreiras e das placas do jogo.

As localizações adicionais são composições provisórias. O encaixe integral do eixo e das cotas LiDAR da fase 1 segue pendente. Até que a posição, o limite e o material dos escapes sejam verificados, o simulador usa seu mapa de superfícies atual.

## Controle e som

O esterço inicial em alta velocidade ficou levemente menos brusco. Perto da borda, a aderência, a resistência ao rolamento e a rigidez lateral passam a usar a média dos pneus apoiados. As amostras de contato são as mesmas usadas pelo áudio, incluindo as dimensões do carro jogador. A frenagem reta medida de 325 a 123 km/h continua em 121,28 m no seco e 149,53 m no molhado. O teste de regressão cobre as rodas de um lado sobre brita e as demais sobre asfalto.

A torcida tem volume próprio no menu Áudio e duas amostras para ouvir. O ambiente parte das arquibancadas e o volume acompanha a distância e a câmera. Ao apagar das luzes em corrida, uma reação da torcida é disparada uma vez, a partir da arquibancada perto da câmera. São gravações de estádio usadas como aproximação para Interlagos. Origem, licença e edição constam no arquivo CREDITS.txt do jogo. O áudio espacial das passagens continua usando os motores gravados e a velocidade relativa. O banco de rádio aceita radio_start.wav ou radio_start.ogg. O clipe de voz e os sinais gravados de cada luz ainda estão pendentes.

## Validação

- 77 testes passaram, além de lint, build, check:geom e check:scenery.
- No Chrome, carregaram os 22 carros, as sete arquibancadas e as duas amostras de torcida. As capturas curtas em seco e chuva estão em medicoes-fase-1.
- Em simulação automatizada a 180 Hz com entrada do jogador guiada pela IA, todos os 22 carros completaram uma volta no seco e no molhado. O evento de largada foi emitido uma vez por sessão.
