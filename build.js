#!/usr/bin/env node
const process = require('process')
const path    = require('path')
const { readdirSync, readFileSync, writeFileSync, existsSync } = require('fs')
const { execSync, exec }    = require('child_process')

const PWD = path.dirname(process.argv[1])
process.chdir(PWD)


const logger = {
  log: console.log,
  error: (a, ...l) => console.error("\x1b[31m" + a, ...l, "\x1b[0m"),
  title: (a, ...l) => console.log("\n\x1b[1m" + a, ...l, "\x1b[0m"),
}

const getDirectories = source =>
  readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)


const packages = getDirectories('packages');
const args = process.argv.length > 2 ? process.argv.slice(2) : packages;

console.log("Getting started...")

args.forEach(el => {
  const package = el.replace('packages/', '')
  logger.title(`Building packages/${package}`)
  if(!packages.includes(package)){
    logger.error(`ERROR: package "${package}" does not exist!`)
    return
  }
  process.chdir(`${PWD}/packages/${package}`)


  let manifest = {}
  try {  manifest = JSON.parse(readFileSync('package.json'))
  }catch(e){ 
    logger.error(`ERROR: can't open ${package}/package.json, skipping`)
    return
  }
  

  // Hooks
  logger.log(`--> Running npm scripts`)
  if(manifest.scripts && manifest.scripts['build'])     execSync('npm run build')
  if(manifest.scripts && manifest.scripts['build-deb']) execSync('npm run build-deb')


  // Get properties
  let control = {}

  control['Package'] = manifest['name']
  if(manifest['version'])     control['Version']     = manifest['version']
  if(manifest['author'])      control['Maintainer']  = manifest['author']
  if(manifest['description']) control['Description'] = manifest['description']
  if(manifest['homepage'])    control['Homepage']    = manifest['homepage']

  control['Depends'] = 'debyw'
  control['Priority'] = 'optional'

  control = {...control, ...(manifest['debcontrol'] || {})}


  const buildDeb = (arch) => {
    const fileName = `${control['Package']}-${arch}.deb`
    logger.log(`--> Packaging file ${fileName}`)
    // Clean old files
    execSync(`rm -rf ./.deb_pkg`)
    execSync(`mkdir -p ./.deb_pkg/DEBIAN`)

    // Copy app
    if(existsSync('app')){
      const appName = control['Package'].startsWith('debyw-app-') ? control['Package'].replace('debyw-app-', '') : control['Package']

      execSync(`mkdir -p ./.deb_pkg/usr/share/debyw/${appName}`)
      execSync(`cp -R app/. ./.deb_pkg/usr/share/debyw/${appName}`)
    }

    // Copy assets
    if(existsSync('files/all')) execSync(`cp -R files/all/. ./.deb_pkg/`)
    if(arch != 'all')  execSync(`cp -R files/${arch}/. ./.deb_pkg/`)
    
    
    if(!existsSync('./.deb_pkg/DEBIAN/control')){
      const controlFile = Object.entries(control).map( ([key, obj]) =>`${key}: ${obj}`).join('\n')
      writeFileSync('./.deb_pkg/DEBIAN/control', controlFile + `\nArchitecture: ${arch}\n`)
    }

    execSync(`rm -f ../../dist/${fileName}`)
    execSync(`dpkg-deb --build -Zgzip ./.deb_pkg ../../dist/${fileName}`)
  }

  const validArchitectures = ['armel', 'armhf', 'arm64', 'i386', 'amd64', 'mipsel', 'mips64el', 'ppc64el', 's390x']

  let shouldBuildAll = true
  if(existsSync('files')){
    getDirectories('files').forEach( arch => {
      if(arch == 'all') return
      if(!validArchitectures.includes(arch)){
        logger.error(`ERROR: architecture files/${arch} is not a valid architecture`)
        return
      }
      shouldBuildAll = false
      buildDeb(arch)
    })
  }
  if(shouldBuildAll) buildDeb('all')
  execSync(`rm -rf ./.deb_pkg`)
});

logger.title("Updating Packages.gz")
process.chdir(PWD)
execSync('mkdir -p dist')
execSync('rm -rf dist/Packages.gz')
execSync('dpkg-scanpackages -m ./dist | gzip -9c > ./dist/Packages.gz')

logger.title("...done!\n")
