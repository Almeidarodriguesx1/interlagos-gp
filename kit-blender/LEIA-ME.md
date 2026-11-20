# Versão atual: fase 8 — arquivo nativo e integração GLB

Abra `fase-8/Auriverde-Piloto-Fase8.blend`. O guia completo e o exportador estão em `fase-8/LEIA-ME.md`. O jogador agora carrega `public/models/pilot-v8.glb`; o texto abaixo é referência histórica da fase 7.

# Carro piloto — base editável da fase 7

Arquivo: `carro-piloto-fase7.glb`.

Importe o GLB pelo importador glTF 2.0 do Blender e salve seu trabalho em um novo .blend. O arquivo tem geometria, materiais e imagens incorporadas; não requer instalar um plugin no jogo. A exportação/reimportação foi verificada no navegador com GLTFExporter/GLTFLoader. A abertura no Blender não foi executada neste ambiente.

É o carro procedural do jogador desta fase, destinado a refinamento. Não é uma réplica escaneada nem uma reconstrução medida de um F1 2026. Mantém as proporções herdadas do protótipo, inclusive entre-eixos visual de 3,10 m, que ainda difere dos 3,60 m usados pela física. Essa definição deve ser resolvida antes de finalizar o modelo e seus colisores.

Trabalhe primeiro no piloto: nariz e asas, pontões/entradas de ar, cobertura do motor, halo, suspensão e detalhes de cockpit. Preserve peças móveis separadas (rodas, direção e flap traseiro) ao preparar a próxima versão. O GLB desta entrega é um arquivo de referência editável; o jogo continua construindo o carro por código e ainda não carrega automaticamente um GLB editado.

Consulte PARTE-7-CENARIO-COLISOES-CARRO.md na raiz do projeto para validações e referências. O restante do grid não recebeu esta reconstrução.
