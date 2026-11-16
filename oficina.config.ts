import { defineOffice } from './src/config/schema'

// Tu oficina. Es el único archivo que hace falta tocar para cambiar el equipo: quién
// trabaja, qué sabe hacer, con qué herramientas y cómo se ve. La forma completa, con
// cada campo explicado, está en src/config/schema.ts.
//
// Para armarla conversando, abrí el repo con Claude Code y pedile "configurá mi oficina":
// sigue la guía de .claude/skills/configurar-oficina.

export default defineOffice({
  name: 'AI Office',
  voice: 'Escribí en español, claro y sin relleno.',
  model: 'claude-sonnet-5-5',
  maxSubtasks: 3,

  director: {
    id: 'direccion',
    name: 'Dirección',
    role: 'Dirige el equipo',
    description:
      'Recibe tu objetivo, lo divide en subtareas, decide quién hace qué, junta los resultados y te pide aprobación.',
    look: {
      skin: '#F2C7A5',
      hair: '#6B3A2A',
      hairStyle: 'bob',
      outfit: '#E8593C',
      outfitStyle: 'blazer',
      accessory: 'none',
      accent: '#E8593C',
    },
  },

  agents: [
    {
      id: 'investigacion',
      name: 'Investigación',
      role: 'Investiga',
      description: 'Investiga, resume, compara información y entrega hallazgos con sus fuentes.',
      whenToUse: 'Lo que hay que averiguar, comparar o confirmar con fuentes, buscando en la web.',
      instructions:
        'Buscá en la web sólo lo que no sepas con certeza o pueda haber cambiado, con el menor número de búsquedas posible. Separá hechos de opiniones y citá la fuente de cada hallazgo. Lo que no puedas citar, marcalo como dudoso. Entregá hasta 600 palabras, con lo más accionable primero.',
      tools: { webSearch: true },
      room: { style: 'biblioteca', label: 'INVESTIGACIÓN' },
      look: {
        skin: '#8D5A3C',
        hair: '#2B2233',
        hairStyle: 'curly',
        outfit: '#1FA08A',
        outfitStyle: 'sweater',
        accessory: 'glasses',
        accent: '#1FA08A',
      },
    },
    {
      id: 'desarrollo',
      name: 'Desarrollo',
      role: 'Programa',
      description: 'Toma especificaciones y propone la implementación técnica: pasos, cambios y riesgos.',
      whenToUse:
        'Lo técnico: cómo construir o cambiar software, qué módulos tocar, riesgos y cómo comprobar cada paso.',
      instructions:
        'Proponé la implementación: pasos concretos, qué módulos tocar, riesgos y cómo comprobar cada paso. Si no tenés acceso al código, lo que no sepas del proyecto escribilo como supuesto, y nunca digas que probaste algo. Entregá hasta 700 palabras.',
      tools: { githubRepos: true },
      room: { style: 'tecnica', label: 'DESARROLLO' },
      look: {
        skin: '#F6D3B3',
        hair: '#D9A441',
        hairStyle: 'short',
        outfit: '#5B5BD6',
        outfitStyle: 'hoodie',
        accessory: 'headset',
        accent: '#5B5BD6',
      },
    },
    {
      id: 'marketing',
      name: 'Marketing',
      role: 'Vende',
      description:
        'Hace vendible lo que arma el equipo: a quién le sirve, la propuesta de valor, la oferta, los precios y los canales.',
      whenToUse:
        'Sólo si la consigna habla de vender, de clientes, de precios, del mercado o de estrategia comercial.',
      instructions:
        'Tu trabajo es que lo que arma el equipo se pueda vender. Definí a quién le sirve y qué problema le resuelve, la propuesta de valor, cómo empaquetarlo (planes, precios y qué incluye cada uno), por qué canales llegar y qué medir para saber si funciona. Si hace falta mirar el mercado o la competencia, buscá en la web sólo lo que no sepas con certeza y citá la fuente de cada dato. Separá los datos de tus recomendaciones y marcá como supuesto lo que no esté medido. Entregá hasta 600 palabras, con lo más accionable primero.',
      tools: { webSearch: true },
      room: { style: 'creativa', label: 'MARKETING' },
      look: {
        skin: '#F7D7C2',
        hair: '#F2CF6E',
        hairStyle: 'long',
        outfit: '#EF7FB3',
        outfitStyle: 'blazer',
        pants: '#F5BCD4',
        accessory: 'none',
        accent: '#D6458F',
      },
    },
  ],

  // Servidores MCP remotos que pueden usar los agentes. Ejemplo:
  // mcpServers: [{ name: 'tareas', url: 'https://…/mcp', tokenEnv: 'MCP_TAREAS_TOKEN', allowedTools: ['buscar_tareas'] }],
  // y en el agente: tools: { mcp: ['tareas'] }
  mcpServers: [],
})
