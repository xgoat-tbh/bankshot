import { CONFIG } from './config.js';

const wall = (a, b, mat = 'solid') => ({ a, b, mat });
const room = (walls) => {
  const points = [[100,60],[1100,60],[1140,100],[1140,700],[1100,740],[100,740],[60,700],[60,100]];
  return points.map((point, i) => wall(point, points[(i + 1) % points.length])).concat(walls);
};
const goal = (x, y) => {
  const { goalHalfWidth: w, goalHalfHeight: h, goalCut: c } = CONFIG.world;
  return [[x - w + c, y - h], [x + w, y - h], [x + w, y + h - c], [x + w - c, y + h], [x - w, y + h], [x - w, y - h + c]];
};

// These are authored rooms, not generated puzzles. Solutions are executable
// replays using normalized launch power and clockwise angles in screen space.
const AUTHORED_LEVELS = [
  {
    id: 1, name: 'First Contact', par: 1, puck: [250, 280], goal: goal(590, 620),
    walls: room([wall([470, 180], [800, 510]), wall([420, 370], [420, 700])]),
    hazards: [], solution: [{ angleDeg: 0, power: 0.6 }],
  },
  {
    id: 2, name: 'The Return', par: 1, puck: [280, 610], goal: goal(850, 532),
    walls: room([wall([300, 190], [900, 190]), wall([540, 420], [780, 660])]),
    hazards: [], solution: [{ angleDeg: -55, power: 0.65 }],
  },
  {
    id: 3, name: 'Double Take', par: 1, puck: [230, 580], goal: goal(660, 545),
    walls: room([wall([420, 180], [840, 180]), wall([920, 160], [920, 650]), wall([390, 490], [390, 710])]),
    hazards: [], solution: [{ angleDeg: -40, power: 0.85 }],
  },
  {
    id: 4, name: 'The Long Way', par: 2, puck: [220, 650], goal: goal(853, 620),
    walls: room([wall([740, 100], [1020, 380]), wall([400, 330], [400, 720])]),
    hazards: [], solution: [{ angleDeg: -90, power: 0.16 }, { angleDeg: 0, power: 0.65 }],
  },
  {
    id: 5, name: 'Soft Touch', par: 1, puck: [220, 600], goal: goal(890, 559),
    walls: room([wall([400, 170], [950, 170], 'rubber'), wall([490, 450], [700, 660])]),
    hazards: [], solution: [{ angleDeg: -50, power: 0.65 }],
  },
  {
    id: 6, name: 'Break the Line', par: 1, puck: [240, 400], goal: goal(960, 400),
    walls: room([wall([600, 100], [600, 700], 'glass'), wall([780, 170], [990, 270]), wall([260, 610], [490, 690])]),
    hazards: [], solution: [{ angleDeg: 0, power: 0.9 }],
  },
  {
    id: 7, name: 'The Breakthrough', par: 2, puck: [230, 650], goal: goal(980, 184),
    walls: room([wall([400, 350], [400, 720]), wall([620, 100], [620, 720], 'glass'), wall([150, 85], [400, 85], 'rubber')]),
    hazards: [], solution: [{ angleDeg: -90, power: 0.16 }, { angleDeg: 0, power: 0.95 }],
  },
  {
    id: 8, name: 'Chain Reaction', par: 1, puck: [270, 540], goal: goal(620, 580),
    walls: room([wall([350, 170], [800, 170], 'rubber'), wall([350, 420], [800, 420], 'glass'), wall([420, 480], [420, 700])]),
    hazards: [], solution: [{ angleDeg: -65, power: 1 }],
  },
  {
    id: 9, name: 'Negative Space', par: 1, puck: [240, 620], goal: goal(930, 607),
    walls: room([wall([350, 160], [920, 160])]),
    hazards: [[[400, 430], [710, 430], [710, 665], [400, 665]]],
    solution: [{ angleDeg: -55, power: 0.75 }],
  },
  {
    id: 10, name: 'Thread the Needle', par: 1, puck: [210, 400], goal: goal(834, 620),
    walls: room([wall([550, 100], [900, 450], 'rubber'), wall([750, 520], [750, 710])]),
    hazards: [[[390, 300], [650, 300], [650, 375], [390, 375]], [[390, 425], [650, 425], [650, 640], [390, 640]]],
    solution: [{ angleDeg: 0, power: 0.85 }],
  },
  {
    id: 11, name: 'A Safe Distance', par: 2, puck: [210, 650], goal: goal(870, 650),
    walls: room([wall([780, 80], [1020, 320], 'rubber'), wall([820, 450], [1080, 450], 'glass')]),
    hazards: [[[360, 330], [795, 330], [795, 680], [360, 680]]],
    solution: [{ angleDeg: -90, power: 0.16 }, { angleDeg: 0, power: 1 }],
  },
  {
    id: 12, name: 'Final Form', par: 3, puck: [180, 650], goal: goal(560, 604),
    walls: room([wall([340, 520], [340, 720]), wall([900, 720], [1120, 500]), wall([950, 380], [1140, 380], 'glass')]),
    hazards: [[[370, 300], [880, 300], [880, 520], [370, 520]]],
    solution: [{ angleDeg: -90, power: 0.16 }, { angleDeg: 0, power: 0.295 }, { angleDeg: 90, power: 0.75 }],
  },
];

// Translate the original executable tutorial geometry into the expanded canvas.
// Its enclosing bank surfaces remain authored: stretching them changes rebounds.
const translate = ([x,y]) => [x+200,y+50];
export const LEVELS = AUTHORED_LEVELS.map(level=>({...level,authored:true,
  puck:translate(level.puck),goal:level.goal.map(translate),
  walls:level.walls.map(item=>({...item,a:translate(item.a),b:translate(item.b)})),
  hazards:level.hazards.map(polygon=>polygon.map(translate)),
  bounds:{minX:260,maxX:1340,minY:110,maxY:790},
}));
export const MILESTONES = Object.freeze({
  25:{name:'Kinetic Gate',seed:'kinetic-gate'},50:{name:'Gravity Crucible',seed:'gravity-crucible'},
  75:{name:'Orbital Convergence',seed:'orbital-convergence'},100:{name:'Event Horizon',seed:'event-horizon'},
});
