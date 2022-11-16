import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

import { promises as fs } from 'fs'
import { npmConfig } from './npm-config'

(async () => {
  try {
    const owner: string = github.context.repo.owner
    const ownerScope: string = `@${owner}`
    const githubToken: string = core.getInput('github_token', { required: true })
    const publish: boolean = core.getInput('publish') !== 'false'
    const push: boolean = core.getInput('push') !== 'false'
    const name: string = core.getInput('name')
    const email: string = core.getInput('email')
    const message: string = core.getInput('message')

    let publishToGithub: boolean
    let scope: string
    let cli: string
    let cliPath: string
    let release: (
      path: string,
      release: boolean,
      publish: boolean,
      message: string,
      env?: { [variable: string]: string }
    ) => Promise<void>

    try {
      await fs.access('lerna.json')
      cli = 'lerna'
      release = lernaRelease

      core.info(
        'Lerna detected, releasing using lerna'
      )
    } catch(_) {
      cli = 'semantic-release'
      release = semanticRelease

      core.info(
        'Lerna not detected, releasing using semantic-release'
      )
    }

    try {
      const pkg = JSON.parse((await fs.readFile('package.json')).toString())
      scope = pkg.name.slice(0, pkg.name.indexOf('/'))
      publishToGithub = publish && scope === ownerScope
    } catch (_) {
      scope = ownerScope
      publishToGithub = false
    }

    if (!publish) {
      core.info(
        'Publishing disabled, skipping publishing to package registries'
      )
    }
    else {
      scope !== ownerScope && core.warning(
        `Package not scoped with ${ownerScope}, skipping publishing to GitHub registry`
      )
    }

    try {
      await fs.access(`node_modules/${cli}/package.json`)
    } catch (_) {
      core.info(
        `Installing ${cli}...`
      )

      await exec.exec('npm', [
        'install',
        cli,
        '--no-save',
        '--no-package-lock'
      ])

      core.info(
        `Installed ${cli}`
      )
    }

    cliPath = `node_modules/${cli}/${JSON
      .parse((await fs.readFile(`node_modules/${cli}/package.json`)).toString())
      .bin[cli]
    }`

    await exec.exec('git', ['config', '--global', 'user.name', name])
    await exec.exec('git', ['config', '--global', 'user.email', email])

    core.info(
      `Creating release on GitHub${publishToGithub ? ' and publishing to GitHub registry' : ''}...`
    )

    await release(cliPath, true, publishToGithub, message, {
      ...process.env,
      NPM_CONFIG_REGISTRY: `https://npm.pkg.github.com`,
      NPM_TOKEN: githubToken,
      GITHUB_TOKEN: githubToken
    })

    core.info(
      'Release available on GitHub'
    )

    publishToGithub && core.info(
      'Package available on GitHub registry'
    )

    if (push) {
      core.info(
        'Pushing changes to GitHub repository...'
      )

      await exec.exec('git', ['push'])

      core.info(
        'GitHub repository up to date'
      )
    }
  } catch (error) {
    core.setFailed(error.message)
  }
})()

async function lernaRelease(
  path: string,
  release: boolean,
  publish: boolean,
  message: string,
  env: { [variable: string]: string } = {}
): Promise<void> {
  if (release) {
  }

  if (publish) {
    const npmEnv = await npmConfig(
      env.NPM_CONFIG_REGISTRY,
      env.NPM_TOKEN,
      message
    )

    await exec.exec('node', [
      path,
      'publish',
      'from-package',
      '--yes',
      '--canary',
      '--preid',
      'test',
      '--pre-dist-tag',
      'test',
      '--registry',
      env.NPM_CONFIG_REGISTRY
    ], {
      env: { ...env, ...npmEnv }
    })
  }
}

async function semanticRelease(
  path: string,
  release: boolean,
  publish: boolean,
  message: string,
  env: { [variable: string]: string } = {}
): Promise<void> {
  if (release) {
    await exec.exec('node', [
      path,
      '--no-ci',
      '--extends',
      `${__dirname}/../release.config.js`
    ], { env })
  }

  if (publish) {
    const npmEnv = await npmConfig(
      env.NPM_CONFIG_REGISTRY,
      env.NPM_TOKEN,
      message
    )

    await exec.exec('yarn', [
      'publish',
      '--non-interactive',
      '--no-git-tag-version',
      '--access', 'public'
    ], { env: { ...env, ...npmEnv } })
  }
}
