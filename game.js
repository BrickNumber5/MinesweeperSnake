// MinesweeperSnake Core Game Logic

let DEBUGMODE = false;

const lerp = ( a, b, t ) => ( 1 - t ) * a + t * b;
const mod  = ( a, n ) => ( ( a % n ) + n ) % n;
const sqrdist = ( x1, y1, x2, y2 ) => ( x2 - x1 ) ** 2 + ( y2 - y1 ) ** 2;
const dist = ( x1, y1, x2, y2 ) => Math.sqrt( sqrdist( x1, y1, x2, y2 ) );

const TURNTIME = 200;

const CELLSIZE = 35;
const COLORS = {
  CLEARED: [ "#7bb7ff", "#56a3ff" ],
  COVERED: [ "#475568", "#2b394c" ],
  SNAKE: "#840ebf",
  NUMBER: [ null, "#db4545", "#db7145", "#6de30e", "#004687", "#9500aa", "#e31849", "#0c0027", "#bae5db" ],
  APPLE: "#bf0e0e",
  APPLELEAF: "#0ebf34",
  TITLETEXT: "#fff",
  DEBUG: "#cc2222",
  DEBUG2: "#228822",
  EYES: [ "#fff", "#000", "#0002" ]
};

const cnv = document.querySelector( ".main canvas" );
const ctx = cnv.getContext( "2d" );
let width, height;
setCanvasSize( );

let snakeX = 0,
    snakeY = 0;

let cameraX = 0,
    cameraY = 0;

const DIRECTION = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3
};

function dirToVector( dir ) {
  switch ( dir ) {
    case DIRECTION.UP:
      return { x:  0, y: -1 };
    case DIRECTION.RIGHT:
      return { x:  1, y:  0 };
    case DIRECTION.DOWN:
      return { x:  0, y:  1 };
    case DIRECTION.LEFT:
      return { x: -1, y:  0 };
  }
}

let snakeDir = DIRECTION.RIGHT;
let directionsQueue;

let snake;

let usedCourtesyTurn = false;
let clearedTile = false;

const REGIONSIZE = 16;

let regions;

class Region {
  constructor( rx, ry, center = false ) {
    this.rx = rx;
    this.ry = ry;
    this.wx = rx * REGIONSIZE;
    this.wy = ry * REGIONSIZE;
    this.populate( center );
  }
  get( x, y ) {
    return this.cells[ x + y * REGIONSIZE ];
  }
  populate( center ) {
    const likelyhood = ( x, y ) => 1 / ( 3 * ( ( 1 + ( Math.E ** -( dist( x, y, 7.5, 7.5 ) / ( 4 * REGIONSIZE ) ) ) ) ** 3 ) );
    let that = this;
    if ( center ) {
      this.cells = Array.from( { length: REGIONSIZE * REGIONSIZE }, ( _, i ) => {
        let x = i % REGIONSIZE,
            y = Math.floor( i / REGIONSIZE );
        if ( x >= REGIONSIZE / 4 && x < REGIONSIZE - REGIONSIZE / 4 && y >= REGIONSIZE / 4 && y < REGIONSIZE - REGIONSIZE / 4 ) {
          return { mine: false, covered: false, number: null };
        } else {
          return {
            mine: Math.random( ) <= likelyhood( that.wx + ( i % REGIONSIZE ), that.wy + Math.floor( i / REGIONSIZE ) ),
            covered: true,
            number: null
          };
        }
      } );
    } else {
      this.cells = Array.from( { length: REGIONSIZE * REGIONSIZE }, ( _, i ) => ( {
        mine: Math.random( ) <= likelyhood( that.wx + ( i % REGIONSIZE ), that.wy + Math.floor( i / REGIONSIZE ) ),
        covered: true,
        number: null
      } ) );
    }
  }
}

let apples = new Set( ), eatenApple = false;

let textureAtlas;

( async ( ) => {
  let ff = await new FontFace( "Roboto Bold Modified", "url(robotomodified/Roboto-Bold-Modified.ttf)" ).load( );
  document.fonts.add( ff );
  let titleTextureInstructions = await fetch( "./title.txt" ).then( f => f.text( ) );
  createTextureAtlas( titleTextureInstructions );
  initGame( );
  requestAnimationFrame( draw );
} )( );

let paused = true;

let score = 0, highscore = +( localStorage.getItem( "minesweeperSnake::highscore" ) ?? 0 );
function setScore( s ) {
  score = s;
  if ( score > 0 ) scoreUpdateAnimationTime = 4;
  if ( score > highscore ) {
    highscore = score;
    highscoreUpdateAnimationTime = 4;
    localStorage.setItem( "minesweeperSnake::highscore", score );
  }
}
function addScore( s ) { setScore( score + s ); }

window.onresize = setCanvasSize;
function setCanvasSize( ) {
  width  = cnv.width  = window.innerWidth;
  height = cnv.height = window.innerHeight;
}

function initGame( ) {
  snakeX = 8;
  snakeY = 8;
  
  snakeDir = DIRECTION.RIGHT;
  directionsQueue = [ ];
  
  snake = [ { x: 4, y: 8 }, { x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 8 } ];
  
  cameraX = 0;
  cameraY = 0;
  
  usedCourtesyTurn = false;
  clearedTile = false;
  
  regions = new Map( );
  regions.set( "0/0", new Region( 0, 0, true ) );
  
  apples.clear( );
  apples.add( { x: 10, y: 8 } );
  eatenApple = false;
  
  clearedTileAnimations.clear( );
  
  scoreAnimations.clear( );
  
  projectedSnake = { extraSnake: [ ], tailSans: 0, state: "move", direction: DIRECTION.RIGHT };
  
  paused = true;
  
  setScore( 0 );
  
  deathStatistics.dead = false;
  deathStatistics.deathTimer = 0;
  deathStatistics.explosionParticles = [ ];
}

const clearedTileAnimations = new Set( );

const scoreAnimations = new Set( );

let scoreUpdateAnimationTime = 0, highscoreUpdateAnimationTime = 0;

let blinkingTimer = 100;

const deathStatistics = {
  dead: false,
  deathTimer: 0,
  explosionParticles: [ ]
};

// Core Loop
let prevTime = -1, elapsedTime, timeSinceLastTurn = 0, timeSinceLastCellUpdate = 0;
function draw( time ) {
  if ( prevTime === -1 || time - prevTime > 1000 ) {
    prevTime = time;
    requestAnimationFrame( draw );
    return;
  }
  
  elapsedTime = time - prevTime;
  prevTime = time;
  
  generateWorldAsNeeded( );
  timeSinceLastCellUpdate += elapsedTime;
  if ( timeSinceLastCellUpdate >= TURNTIME / 3 ) {
    timeSinceLastCellUpdate -= TURNTIME / 3;
    updateCells( );
  }
  
  updateCamera( );
  drawGrid( );
  drawApples( );
  if ( clearedTileAnimations.size > 0 ) drawClearedTileAnimations( );
  if ( DEBUGMODE ) drawDebugRegions( );
  if ( DEBUGMODE ) drawDebugMines( );
  drawSnake( );
  if ( DEBUGMODE ) drawDebugProjectedSnake( );
  if ( scoreAnimations.size > 0 ) drawScoreAnimations( );
  
  if ( deathStatistics.dead ) {
    let t = deathStatistics.deathTimer -= elapsedTime;
    drawExplosion( deathStatistics.explosionParticles, t );
    if ( t <= 0 ) {
      initGame( );
    }
  } else {
    timeSinceLastTurn += elapsedTime;
    if ( timeSinceLastTurn >= TURNTIME ) {
      timeSinceLastTurn -= TURNTIME;
      turnLogic( );
      blinkingTimer--;
      if ( blinkingTimer < 0 ) {
        blinkingTimer = Math.random( ) < 0.2 ? 2 : 20 + Math.round( Math.random( ) * 180 );
      }
    }
  }
  
  requestAnimationFrame( draw );
}

function updateCells( ) {
  const xLower = Math.floor( cameraX - width / CELLSIZE ),
        xUpper = Math.ceil(  cameraX + width / CELLSIZE ),
        yLower = Math.floor( cameraY - height / CELLSIZE ),
        yUpper = Math.ceil(  cameraY + height / CELLSIZE ); 
  for ( let x = xLower - 1; x < xUpper + 1; x++ ) {
    for ( let y = yLower - 1; y < yUpper + 1; y++ ) {
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE )  );
      if ( cell.number !== null ) continue;
      if ( cell.mine ) {
        cell.number = -1;
        continue;
      }
      let num = 0;
      for ( let i = -1; i <= 1; i++ ) {
        for ( let j = -1; j <= 1; j++ ) {
          if ( i === 0 && j === 0 ) continue;
          let nx = x + i, ny = y + j;
          let neighborCellCoordinate = Math.floor( nx / REGIONSIZE ) + "/" + Math.floor( ny / REGIONSIZE );
          let neighborCell = regions.get( neighborCellCoordinate ).get( mod( nx, REGIONSIZE ), mod( ny, REGIONSIZE )  );
          if ( neighborCell.mine ) num++;
        }
      }
      cell.number = num;
    }
  }
  let toClear = [ ];
  for ( let x = xLower; x < xUpper; x++ ) {
    for ( let y = yLower; y < yUpper; y++ ) {
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE ) );
      if ( !cell.covered || cell.mine ) continue;
      for ( let i = -1; i <= 1; i++ ) {
        for ( let j = -1; j <= 1; j++ ) {
          if ( i === 0 && j === 0 ) continue;
          let nx = x + i, ny = y + j;
          let neighborCellCoordinate = Math.floor( nx / REGIONSIZE ) + "/" + Math.floor( ny / REGIONSIZE );
          let neighborCell = regions.get( neighborCellCoordinate ).get( mod( nx, REGIONSIZE ), mod( ny, REGIONSIZE ) );
          if ( !neighborCell.covered && neighborCell.number === 0 ) toClear.push( { x, y, c: cell } );
        }
      }
    }
  }
  scoreAnimations.forEach( s => { s.time--; if ( s.time <= 0 ) scoreAnimations.delete( s ); } );
  clearedTileAnimations.forEach( t => { t.time--; if ( t.time <= 0 ) clearedTileAnimations.delete( t ); } );
  if ( scoreUpdateAnimationTime > 0 ) scoreUpdateAnimationTime--;
  if ( highscoreUpdateAnimationTime > 0 ) highscoreUpdateAnimationTime--;
  toClear.forEach( cell => {
    cell.c.covered = false;
    if ( cell.x >= Math.floor( cameraX - ( width  / 2 ) / CELLSIZE ) - 1
      && cell.x <= Math.ceil(  cameraX + ( width  / 2 ) / CELLSIZE ) + 1
      && cell.y >= Math.floor( cameraY - ( height / 2 ) / CELLSIZE ) - 1
      && cell.y <= Math.ceil(  cameraY + ( height / 2 ) / CELLSIZE ) + 1 ) {
      clearedTileAnimations.add( { x: cell.x, y: cell.y, time: 3 } );
    }
  } );
  spawnApples( );
}

function spawnApples( ) {
  outer: for ( region of regions ) {
    region = region[ 1 ]; // for of loops are weird
    let x = Math.floor( Math.random( ) * REGIONSIZE ),
        y = Math.floor( Math.random( ) * REGIONSIZE );
    if ( region.get( x, y ).mine ) continue outer;
    if ( !region.get( x, y ).covered && Math.random( ) > 0.1 ) continue outer;
    x = region.wx + x;
    y = region.wy + y;
    if ( sqrdist( x, y, snakeX, snakeY ) <= 64 ) continue outer;
    for ( let i = 1; i < snake.length; i++ ) {
      if ( x === snake[ i ].x && y === snake[ i ].y ) continue outer;
    }
    for ( apple of apples ) {
      if ( sqrdist( x, y, apple.x, apple.y ) <= 1024 /* 32 ** 2 */ ) continue outer;
    }
    apples.add( { x, y } );
  }
}

function worldToScreenY( y ) { return Math.round( CELLSIZE * ( y - cameraY ) + height / 2 ); }
function worldToScreenX( x ) { return Math.round( CELLSIZE * ( x - cameraX ) + width  / 2 ); }

function worldToScreen( x, y ) {
  return { x: worldToScreenX( x ), y: worldToScreenY( y ) };
}

function worldToScreenArr( x, y ) { ({ x, y } = worldToScreen( x, y )); return [ x, y ]; }

function drawGrid( ) {
  const xLower = Math.floor( cameraX - ( width  / 2 ) / CELLSIZE ),
        xUpper = Math.ceil(  cameraX + ( width  / 2 ) / CELLSIZE ),
        yLower = Math.floor( cameraY - ( height / 2 ) / CELLSIZE ),
        yUpper = Math.ceil(  cameraY + ( height / 2 ) / CELLSIZE ); 
  for ( let x = xLower; x < xUpper; x++ ) {
    let xCell = worldToScreenX( x );
    for ( let y = yLower; y < yUpper; y++ ) {
      let yCell = worldToScreenY( y );
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE ) );
      ctx.fillStyle = COLORS[ cell.covered ? "COVERED" : "CLEARED" ][ ( x + y ) & 1 ];
      ctx.fillRect( xCell, yCell, CELLSIZE, CELLSIZE );
      if ( !cell.covered && cell.number > 0 ) {
        ctx.drawImage( textureAtlas, 100 * cell.number, 0, 100, 100, xCell, yCell, CELLSIZE, CELLSIZE );
      }
    }
  }
  // Draw Titlecard
  {
    let { x: xCell, y: yCell } = worldToScreen( 5, 5 );
    ctx.drawImage(
      textureAtlas,
      0, 100, 600, 600,
      xCell, yCell, 6 * CELLSIZE, 6 * CELLSIZE
    );
    ctx.fillStyle = COLORS.TITLETEXT;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `${ CELLSIZE * 0.75 * (1 + scoreUpdateAnimationTime / 8) }px "Roboto Bold Modified"`;
    ctx.fillText( score, xCell + 1.2 * CELLSIZE, yCell + 4.6 * CELLSIZE );
    ctx.font = `${ CELLSIZE * 0.75 * (1 + highscoreUpdateAnimationTime / 8) }px "Roboto Bold Modified"`;
    ctx.fillText( highscore, xCell + 1.2 * CELLSIZE, yCell + 5.2 * CELLSIZE );
  }
}

function drawApples( ) {
  apples.forEach( apple => {
    let { x, y } = apple;
    let { x: xCell, y: yCell } = worldToScreen( x, y );
    let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE ) );
    if ( !cell.covered || DEBUGMODE ) {
      ctx.drawImage( textureAtlas, 900, 0, 100, 100, xCell, yCell, CELLSIZE, CELLSIZE );
    }
  } );
  if ( eatenApple ) {
    let {x: xCell, y: yCell} = worldToScreen( snakeX, snakeY );
    let offset = CELLSIZE * timeSinceLastTurn / TURNTIME
    ctx.drawImage( textureAtlas, 900, 0, 100, 100, xCell + offset / 2, yCell + offset / 2, CELLSIZE - offset, CELLSIZE - offset );
  }
}

function drawClearedTileAnimations( ) {
  clearedTileAnimations.forEach( tile => {
    let { x, y, time } = tile;
    let t = timeSinceLastCellUpdate + ( 3 - time ) * ( TURNTIME / 3 );
    ctx.fillStyle = COLORS.COVERED[ ( x + y ) & 1 ];
    let { x: xCell, y: yCell } = worldToScreen( x, y );
    let offset = ( t / TURNTIME ) * CELLSIZE;
    ctx.fillRect( xCell + offset / 2, yCell + offset / 2, CELLSIZE - offset, CELLSIZE - offset );
  } );
}

function drawScoreAnimations( ) {
  scoreAnimations.forEach( scoreobj => {
    let { x, y, v, time } = scoreobj;
    const t = time > 12 ? 32 - 2 * time : time > 8 ? 8 : time;
    ctx.fillStyle = `#fff${ ( t * 16 ).toString( 16 )[ 0 ] }`;
    let { x: xCell, y: yCell } = worldToScreen( x, y );
    ctx.font = `${ CELLSIZE * ( t / 8 ) }px "Roboto Bold Modified"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText( v, xCell + CELLSIZE / 2, yCell + CELLSIZE / 2 );
  } );
}

function drawSnake( ) {
  let turnAnimation = timeSinceLastTurn / TURNTIME;
  let tailFrozen = usedCourtesyTurn || clearedTile || paused || deathStatistics.dead || eatenApple,
      headFrozen = usedCourtesyTurn || clearedTile || paused || deathStatistics.dead;
  ctx.strokeStyle = COLORS.SNAKE;
  ctx.lineWidth = CELLSIZE * 0.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath( );
  if ( tailFrozen ) {
    ctx.moveTo(
      CELLSIZE * ( snake[ 1 ].x - cameraX + 0.5 ) + width / 2,
      CELLSIZE * ( snake[ 1 ].y - cameraY + 0.5 ) + height / 2
    );
  } else {
    ctx.moveTo(
      CELLSIZE * ( lerp( snake[ 0 ].x, snake[ 1 ].x, turnAnimation ) - cameraX + 0.5 ) + width / 2,
      CELLSIZE * ( lerp( snake[ 0 ].y, snake[ 1 ].y, turnAnimation ) - cameraY + 0.5 ) + height / 2
    );
  }
  for ( let i = 1; i < snake.length - 1; i++ ) {
    ctx.lineTo( CELLSIZE * ( snake[ i ].x - cameraX + 0.5 ) + width / 2, CELLSIZE * ( snake[ i ].y - cameraY + 0.5 ) + height / 2 );
  }
  let snakeHead;
  if ( headFrozen ) {
    snakeHead = {
      x: CELLSIZE * ( snake.at( -1 ).x - cameraX + 0.5 ) + width / 2,
      y: CELLSIZE * ( snake.at( -1 ).y - cameraY + 0.5 ) + height / 2
    };
  } else {
    snakeHead = {
      x: CELLSIZE * ( lerp( snake.at( -2 ).x, snake.at( -1 ).x, turnAnimation ) - cameraX + 0.5 ) + width / 2,
      y: CELLSIZE * ( lerp( snake.at( -2 ).y, snake.at( -1 ).y, turnAnimation ) - cameraY + 0.5 ) + height / 2
    };
  }
  ctx.lineTo( snakeHead.x, snakeHead.y );
  ctx.stroke( );
  
  let norm = dirToVector( snakeDir );
  norm.x *= CELLSIZE;
  norm.y *= CELLSIZE;
  let tan = {
    x: norm.y,
    y: -norm.x
  };
  ctx.strokeStyle = blinkingTimer <= 0 ? COLORS.EYES[ 2 ] : COLORS.EYES[ 0 ];
  ctx.lineWidth = CELLSIZE * 0.25;
  ctx.beginPath( );
  ctx.moveTo( snakeHead.x + 0.15 * tan.x, snakeHead.y + 0.15 * tan.y );
  ctx.lineTo( snakeHead.x + 0.15 * tan.x + 0.1 * norm.x, snakeHead.y + 0.15 * tan.y + 0.1 * norm.y );
  ctx.moveTo( snakeHead.x - 0.15 * tan.x, snakeHead.y - 0.15 * tan.y );
  ctx.lineTo( snakeHead.x - 0.15 * tan.x + 0.1 * norm.x, snakeHead.y - 0.15 * tan.y + 0.1 * norm.y );
  ctx.stroke( );
  if ( blinkingTimer > 0 ) {
    ctx.strokeStyle = COLORS.EYES[ 1 ];
    ctx.lineWidth = CELLSIZE * 0.175;
    ctx.beginPath( );
    ctx.moveTo( snakeHead.x + 0.15 * tan.x + 0.1 * norm.x, snakeHead.y + 0.15 * tan.y + 0.1 * norm.y );
    ctx.lineTo( snakeHead.x + 0.15 * tan.x + 0.1 * norm.x, snakeHead.y + 0.15 * tan.y + 0.1 * norm.y );
    ctx.moveTo( snakeHead.x - 0.15 * tan.x + 0.1 * norm.x, snakeHead.y - 0.15 * tan.y + 0.1 * norm.y );
    ctx.lineTo( snakeHead.x - 0.15 * tan.x + 0.1 * norm.x, snakeHead.y - 0.15 * tan.y + 0.1 * norm.y );
    ctx.stroke( );
  }
}

function drawExplosion( particles, t ) {
  for ( p of particles ) {
    let T = t + p.t;
    let v = 255 * T / 250;
    ctx.strokeStyle = `rgba(${ v }, ${ v }, ${ v })`;
    ctx.lineWidth = p.s;
    ctx.beginPath( );
    ctx.moveTo( p.x, p.y );
    ctx.lineTo( p.x, p.y );
    ctx.stroke();
    p.x += p.u * elapsedTime * 4;
    p.y += p.v * elapsedTime * 4;
    p.s *= 0.985 ** ( elapsedTime / 5 );
  }
}

function updateCamera( ) {
  let turnAnimation = timeSinceLastTurn / TURNTIME;
  let headFrozen = usedCourtesyTurn || clearedTile || paused || deathStatistics.dead;
  if ( headFrozen ) {
    cameraX = snakeX + 0.5;
    cameraY = snakeY + 0.5;
  } else {
    cameraX = lerp( snake.at( -2 ).x, snakeX, turnAnimation ) + 0.5;
    cameraY = lerp( snake.at( -2 ).y, snakeY, turnAnimation ) + 0.5;
  }
}

function drawDebugRegions( ) {
  ctx.strokeStyle = COLORS.DEBUG;
  ctx.lineWidth = CELLSIZE * 0.2;
  ctx.lineJoin = "miter";
  const xLower = Math.floor( ( cameraX - ( width  / 2 ) / CELLSIZE ) / REGIONSIZE ),
        xUpper = Math.ceil(  ( cameraX + ( width  / 2 ) / CELLSIZE ) / REGIONSIZE ),
        yLower = Math.floor( ( cameraY - ( height / 2 ) / CELLSIZE ) / REGIONSIZE ),
        yUpper = Math.ceil(  ( cameraY + ( height / 2 ) / CELLSIZE ) / REGIONSIZE );
  for ( let x = xLower; x < xUpper; x++ ) {
    let xCell = worldToScreenX( x * REGIONSIZE );
    for ( let y = yLower; y < yUpper; y++ ) {
      let yCell = worldToScreenY( y * REGIONSIZE );
      ctx.strokeRect( xCell, yCell, CELLSIZE * REGIONSIZE, CELLSIZE * REGIONSIZE );
    }
  }
}

function drawDebugMines( ) {
  ctx.fillStyle = COLORS.DEBUG;
  const xLower = Math.floor( cameraX - ( width  / 2 ) / CELLSIZE ),
        xUpper = Math.ceil(  cameraX + ( width  / 2 ) / CELLSIZE ),
        yLower = Math.floor( cameraY - ( height / 2 ) / CELLSIZE ),
        yUpper = Math.ceil(  cameraY + ( height / 2 ) / CELLSIZE ); 
  for ( let x = xLower; x < xUpper; x++ ) {
    let xCell = worldToScreenX( x );
    for ( let y = yLower; y < yUpper; y++ ) {
      let yCell = worldToScreenY( y );
      let cell = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) ).get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE )  );
      if ( cell.mine ) {
        ctx.fillRect( xCell + 0.2 * CELLSIZE, yCell + 0.2 * CELLSIZE, 0.6 * CELLSIZE, 0.6 * CELLSIZE );
      }
    }
  }
}

function drawDebugProjectedSnake( ) {
  let virtualSnake = [ ...snake, ...projectedSnake.extraSnake ].slice( projectedSnake.tailSans );
  ctx.strokeStyle = COLORS.DEBUG2;
  ctx.lineWidth = CELLSIZE * 0.25;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.beginPath( );
  ctx.moveTo( ...worldToScreenArr( virtualSnake[ 1 ].x + 0.5, virtualSnake[ 1 ].y + 0.5 ) );
  for ( let i = 1; i < virtualSnake.length - 1; i++ ) {
    ctx.lineTo( ...worldToScreenArr( virtualSnake[ i ].x + 0.5, virtualSnake[ i ].y + 0.5 ) );
  }
  let { x, y } = worldToScreen( virtualSnake.at( -1 ).x + 0.5, virtualSnake.at( -1 ).y + 0.5 );
  ctx.lineTo( x, y );
  ctx.stroke( );
  let v = dirToVector( projectedSnake.direction );
  x += v.x * 0.5 * CELLSIZE;
  y += v.y * 0.5 * CELLSIZE;
  if ( projectedSnake.state === "move" ) {
    ctx.beginPath( );
    ctx.moveTo( x + v.y * 0.25 * CELLSIZE, y - v.x * 0.25 * CELLSIZE );
    ctx.lineTo( x + v.x * 0.25 * CELLSIZE, y + v.y * 0.25 * CELLSIZE );
    ctx.lineTo( x - v.y * 0.25 * CELLSIZE, y + v.x * 0.25 * CELLSIZE );
    ctx.stroke( );
  } else if ( projectedSnake.state === "break" ) {
    ctx.beginPath( );
    ctx.moveTo( x, y );
    ctx.lineTo( x, y )
    ctx.stroke( );
  } else if ( projectedSnake.state === "courtesy" ) {
    ctx.beginPath( );
    ctx.moveTo( x + ( -v.x + v.y ) * 0.125 * CELLSIZE, y + ( -v.x - v.y ) * 0.125 * CELLSIZE );
    ctx.lineTo( x + (  v.x - v.y ) * 0.125 * CELLSIZE, y + (  v.x + v.y ) * 0.125 * CELLSIZE );
    ctx.stroke( );
    ctx.beginPath( );
    ctx.moveTo( x + ( -v.x - v.y ) * 0.125 * CELLSIZE, y + ( -v.y + v.x ) * 0.125 * CELLSIZE );
    ctx.lineTo( x + (  v.x + v.y ) * 0.125 * CELLSIZE, y + (  v.y - v.x ) * 0.125 * CELLSIZE );
    ctx.stroke( );
  }
}

function turnLogic( ) {
  if ( paused === true || deathStatistics.dead ) return;
  paused = false;
  moveSnake( );
  projectState( );
}

function moveSnake( ) {
  if ( directionsQueue.length > 0 ) {
    snakeDir = directionsQueue.pop( );
    projectedSnake.tailSans--;
    if ( projectedSnake.tailSans < 0 ) projectedSnake.tailSans = 0;
    projectedSnake.extraSnake.shift( );
  } else {
    projectedSnake.direction = snakeDir;
  }
  clearedTile = false;
  eatenApple = false;
  let col = checkCollision( );
  if ( col ) {
    if ( usedCourtesyTurn ) {
      if ( col === "snake" ) {
        reset( "self-collision" );
        return;
      } else {
        usedCourtesyTurn = false;
        clearedTile = true;
        let vector = dirToVector( snakeDir );
        let tx = snakeX + vector.x,
            ty = snakeY + vector.y;
        let region = regions.get( Math.floor( tx / REGIONSIZE ) + "/" + Math.floor( ty / REGIONSIZE ) );
        let cell = region.get( mod( tx, REGIONSIZE ), mod( ty, REGIONSIZE ) );
        if ( cell.mine ) {
          reset( "explosion" );
        } else {
          cell.covered = false;
          clearedTileAnimations.add( { x: tx, y: ty, time: 3 } );
          const s = Math.floor( ( snake.length - 1 ) * ( Math.abs( tx ) + Math.abs( ty ) ) / REGIONSIZE );
          scoreAnimations.add( { x: tx, y: ty, v: s, time: 16 } );
          addScore( s );
        }
        return;
      }
    } else {
      usedCourtesyTurn = true;
      return;
    }
  } else {
    usedCourtesyTurn = false;
  }
  let vector = dirToVector( snakeDir );
  snakeX += vector.x;
  snakeY += vector.y;
  snake.push( { x: snakeX, y: snakeY } );
  for ( apple of apples ) {
    if ( apple.x === snakeX && apple.y === snakeY ) {
      apples.delete( apple );
      eatenApple = true;
      const s = Math.floor( 100 );
      scoreAnimations.add( { x: snakeX, y: snakeY, v: s, time: 16 } );
      addScore( s );
      break;
    }
  }
  if ( !eatenApple ) snake.shift( );
}

function checkCollision( ) {
  let vector = dirToVector( snakeDir );
  let tx = snakeX + vector.x,
      ty = snakeY + vector.y;
  let region = regions.get( Math.floor( tx / REGIONSIZE ) + "/" + Math.floor( ty / REGIONSIZE ) );
  let cell = region.get( mod( tx, REGIONSIZE ), mod( ty, REGIONSIZE ) );
  if ( cell.covered ) return "cell";
  for ( let i = 1; i < snake.length; i++ ) {
    if ( snake[ i ].x === tx && snake[ i ].y === ty ) {
      return "snake";
    }
  }
  return null;
}

let debugmodecounter = 0;

function fromDir( px, py, nx, ny ) {
  if ( ny - py === -1 ) return DIRECTION.DOWN;
  if ( nx - px ===  1 ) return DIRECTION.LEFT;
  if ( ny - py ===  1 ) return DIRECTION.UP;
  if ( nx - px === -1 ) return DIRECTION.RIGHT;
  return -1;
}

let projectedSnake = { extraSnake: [ ], tailSans: 0, state: "move", direction: DIRECTION.RIGHT };

window.addEventListener( "keydown", e => {
  if ( deathStatistics.dead ) return;
  let dir = null;
  switch( e.key ) {
    case "w":
    case "ArrowUp":
      dir = DIRECTION.UP;
      break;
    case "d":
    case "ArrowRight":
      dir = DIRECTION.RIGHT;
      break;
    case "s":
    case "ArrowDown":
      dir = DIRECTION.DOWN;
      break;
    case "a":
    case "ArrowLeft":
      dir = DIRECTION.LEFT;
      break;
    case "D":
      debugmodecounter++;
      if ( debugmodecounter >= 5 ) {
        DEBUGMODE = !DEBUGMODE;
        debugmodecounter = 0;
      }
      break;
  }
  if ( dir !== null && directionsQueue.length < 5 ) {
    if ( paused === true ) {
      if ( dir !== fromDir( snake.at( -2 ).x, snake.at( -2 ).y, snakeX, snakeY ) ) {
        paused = 2;
        projectedSnake.direction = dir;
        projectedSnake.tailSans = 1;
        let v = dirToVector( dir );
        projectedSnake.extraSnake.push( { x: snakeX + v.x, y: snakeY + v.y } );
        directionsQueue.unshift( dir );
      }
    } else {
      let dq0 = directionsQueue[ 0 ] ?? snakeDir;
      let virtualSnake = [ ...snake, ...projectedSnake.extraSnake ].slice( projectedSnake.tailSans );
      if ( dir !== projectedSnake.direction
        && dir !== fromDir( virtualSnake.at( -2 ).x, virtualSnake.at( -2 ).y, virtualSnake.at( -1 ).x, virtualSnake.at( -1 ).y ) ) {
        projectedSnake.direction = dir;
        projectState( );
        if ( projectedSnake.state === "move" ) {
          projectedSnake.tailSans++;
          for ( apple of apples ) {
            if ( virtualSnake.at( -1 ).x === apple.x && virtualSnake.at( -1 ).y === apple.y ) {
              projectedSnake.tailSans--;
              break;
            }
          }
          let v = dirToVector( dir );
          projectedSnake.extraSnake.push( { x: virtualSnake.at( -1 ).x + v.x, y: virtualSnake.at( -1 ).y + v.y } );
        }
        directionsQueue.unshift( dir );
      }
    }
  }
} );

function projectState( ) {
  let virtualSnake = [ ...snake, ...projectedSnake.extraSnake ].slice( projectedSnake.tailSans );
  let x = virtualSnake.at( -1 ).x,
      y = virtualSnake.at( -1 ).y;
  let v = dirToVector( projectedSnake.direction );
  x += v.x;
  y += v.y;
  let region = regions.get( Math.floor( x / REGIONSIZE ) + "/" + Math.floor( y / REGIONSIZE ) );
  let cell = region.get( mod( x, REGIONSIZE ), mod( y, REGIONSIZE ) );
  if ( projectedSnake.state === "move" || projectedSnake.state === "break" ) {
    if ( cell.covered ) {
      projectedSnake.state = "courtesy";
      return;
    }
    for ( let i = 1; i < virtualSnake.length; i++ ) {
      if ( virtualSnake[ i ].x === x && virtualSnake[ i ].y === y ) {
        projectedSnake.state = "courtesy";
        return;
      }
    }
    projectedSnake.state = "move";
  } else if ( projectedSnake.state === "courtesy" ) {
    if ( cell.covered ) {
      projectedSnake.state = "break";
      return;
    }
    projectedSnake.state = "move";
  }
}

function generateWorldAsNeeded( ) {
  const xLower = Math.floor( ( cameraX - width / CELLSIZE ) / REGIONSIZE ) - 1,
        xUpper = Math.ceil(  ( cameraX + width / CELLSIZE ) / REGIONSIZE ) + 1,
        yLower = Math.floor( ( cameraY - height / CELLSIZE ) / REGIONSIZE ) - 1,
        yUpper = Math.ceil(  ( cameraY + height / CELLSIZE ) / REGIONSIZE ) + 1;
  for ( let x = xLower; x < xUpper; x++ ) {
    for ( let y = yLower; y < yUpper; y++ ) {
      let cStr = x + "/" + y;
      if ( !regions.has( cStr ) ) {
        regions.set( cStr, new Region( x, y ) );
      }
    }
  }
}

function createTextureAtlas( titleTextureInstructions ) {
  // Here textureAtlas is the predefined global variable
  let atlas = textureAtlas = document.createElement( "canvas" );
  atlas.width = 1000;
  atlas.height = 700;
  let actx  = atlas.getContext( "2d" );
  
  actx.font = '80px "Roboto Bold Modified"';
  actx.textAlign = "center";
  actx.strokeStyle = "white";
  actx.lineWidth = 5;
  actx.lineJoin = "round";
  for ( let i = 1; i <= 8; i++ ) {
    actx.strokeText( i.toString( ), 100 * i + 50, 75 );
    actx.fillStyle = COLORS.NUMBER[ i ];
    actx.fillText( i.toString( ), 100 * i + 50, 75 );
  }
  
  actx.strokeStyle = COLORS.APPLE;
  actx.lineWidth = 80;
  actx.lineCap = "round";
  actx.beginPath( );
  actx.moveTo( 950, 50 );
  actx.lineTo( 950, 50 );
  actx.stroke( );
  actx.fillStyle = COLORS.APPLELEAF;
  actx.beginPath( );
  actx.ellipse( 950, 20, 20, 10, -Math.PI / 4, 0, 2 * Math.PI );
  actx.fill( );
  
  let tis = titleTextureInstructions.split( /(?:\r?\n)+/ ).map( i => {
    const [ instruction, ...params ] = i.split( " " );
    return { instruction, params: params.map( n => +n ), text: i };
  } );
  
  actx.strokeStyle = COLORS.TITLETEXT;
  actx.lineWidth = 8;
  actx.beginPath( );
  for ( ti of tis ) {
    const { instruction, params, text } = ti;
    if ( instruction === "Move" ) {
      const [ x, y ] = params;
      actx.moveTo( x * 10, 100 + y * 10 );
    } else if ( instruction === "Line" ) {
      const [ x, y ] = params;
      actx.lineTo( x * 10, 100 + y * 10 );
    } else if ( instruction === "####" ) {
      // Comment: Ignore
    } else if ( instruction === "Color" ) {
      const [ r, g, b, a = 1 ] = params;
      actx.stroke( );
      actx.strokeStyle = `rgba(${ r }, ${ g }, ${ b }, ${ a })`;
      actx.beginPath( );
    } else {
      console.warn( `Unknown instruction "${ text }"` );
    }
  }
  actx.stroke( );
  
  // document.body.appendChild( atlas );
}

function reset( reason ) {
  deathStatistics.dead = true;
  deathStatistics.deathTimer = 250;
  let v = dirToVector( snakeDir );
  let x = worldToScreenX( snakeX + 0.5 ) + v.x * CELLSIZE;
  let y = worldToScreenY( snakeY + 0.5 ) + v.y * CELLSIZE;
  for ( let i = 0; i < 150; i++ ) {
    let a = Math.random( ) * 2 * Math.PI;
    let d = Math.random( );
    let s = CELLSIZE * Math.random( ) / 400;
    deathStatistics.explosionParticles.push( {
      x: x + CELLSIZE * d * Math.cos( a ) / 2,
      y: y + CELLSIZE * d * Math.sin( a ) / 2,
      u: Math.cos( a ) * s,
      v: Math.sin( a ) * s,
      t: Math.random( ) * 50 - 25,
      s: ( Math.random( ) + 0.2 ) * CELLSIZE
    } );
  }
  deathStatistics.explosionParticles.sort( ( a, b ) => a.t - b.t );
}