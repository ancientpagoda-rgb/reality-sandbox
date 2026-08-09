const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.REALITY_BASE_URL || 'http://127.0.0.1:4173/';
const artifactDir = process.env.REALITY_EVOLUTION_INSPECTOR_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'evolution-inspector-smoke');
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.REALITY_CHROMIUM_PATH ? { executablePath: process.env.REALITY_CHROMIUM_PATH } : {}),
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => Boolean(
      window.realitySandboxDebug?.ready &&
      window.realitySandboxOriginMotileLifeV47?.installed &&
      window.realitySandboxEvolutionInspectorV47b?.installed &&
      window.realitySandboxEvolutionMorphologyV47c?.installed &&
      window.realitySandboxEvolutionaryMilestonesV47d?.installed &&
      window.realitySandboxLineagePopulationRecordV47e?.installed &&
      window.realitySandboxEvolutionDeepTimeV47f?.installed &&
      window.realitySandboxMorphogenesisV48?.installed
    ), null, { timeout: 120000 });

    const collapsed = await page.evaluate(() => window.realitySandboxEvolutionInspectorV47b.getStats());
    assert(collapsed.collapsedByDefault === true && collapsed.open === false, 'Evolution inspector did not start collapsed.');
    assert(collapsed.shadowDomIsolated === true, 'Evolution inspector is not Shadow-DOM isolated.');

    await page.evaluate(() => window.realitySandboxDebug.advance(3000));
    await page.evaluate(() => window.realitySandboxEvolutionInspectorV47b.open());
    await page.waitForFunction(() => window.realitySandboxEvolutionInspectorV47b?.getStats?.().renderCount >= 1, null, { timeout: 30000 });

    const inspected = await page.evaluate(() => {
      const host = document.getElementById('evolutionInspectorV47bHost');
      const root = host?.shadowRoot;
      const api = window.realitySandboxOriginMotileLifeV47;
      const inspector = window.realitySandboxEvolutionInspectorV47b;
      const morphology = window.realitySandboxEvolutionMorphologyV47c;
      const history = window.realitySandboxEvolutionaryMilestonesV47d;
      const populationRecord = window.realitySandboxLineagePopulationRecordV47e;
      const deepTime = window.realitySandboxEvolutionDeepTimeV47f;
      const morphogenesis = window.realitySandboxMorphogenesisV48;
      const lineages = api.getLineages();
      const motile = lineages.find(x => x.type === 'motile');
      if (motile) inspector.selectLineage(motile.id);
      morphology.render();
      history.render();
      populationRecord.render();
      deepTime.render();
      morphogenesis.render();
      const options = root ? [...root.querySelectorAll('.lineage-select option')].map(x => x.textContent) : [];
      const svg = root?.querySelector('.morph-svg');
      const tree = root?.querySelector('.tree-svg');
      const selected = root?.querySelector('.lineage-select')?.value || null;
      const lineagePhenotypes = morphogenesis.getLineagePhenotypes();
      return {
        build: window.realitySandboxSurfaceBuild,
        inspector: inspector.getStats(),
        morphology: morphology.getStats(),
        history: history.getStats(),
        recordStats: populationRecord.getStats(),
        deepTime: deepTime.getStats(),
        morphogenesis: morphogenesis.getStats(),
        lineagePhenotypes,
        selectedPhenotype: selected ? lineagePhenotypes.find(x => x.lineageId === selected) || null : null,
        record: selected ? populationRecord.getRecord(selected) : null,
        milestones: history.getMilestones(selected),
        options,
        selected,
        speciesTitle: root?.querySelector('.species h2')?.textContent || '',
        ancestry: root?.querySelector('.ancestry')?.textContent || '',
        traitRows: root?.querySelectorAll('.trait')?.length || 0,
        behaviorCells: root?.querySelectorAll('.behavior > div')?.length || 0,
        summaryCells: root?.querySelectorAll('.summary .metric')?.length || 0,
        panelOpen: root?.querySelector('.panel')?.classList.contains('open') || false,
        morphologySvg: Boolean(svg),
        morphologyShapes: svg?.querySelectorAll('ellipse,circle,path')?.length || 0,
        morphologyCaption: svg?.querySelector('.caption')?.textContent || '',
        treeSvg: Boolean(tree),
        treeNodes: tree?.querySelectorAll('.tree-node')?.length || 0,
        milestoneRows: root?.querySelectorAll('.milestone-v47d')?.length || 0,
        milestoneText: root?.querySelector('.milestone-list-v47d')?.textContent || '',
        recordCard: Boolean(root?.querySelector('.record-card-v47e')),
        recordSparkline: Boolean(root?.querySelector('.record-spark-v47e')),
        recordMeta: root?.querySelector('.record-meta-v47e')?.textContent || '',
        deepTimeText: root?.querySelector('.deep-time-v47f')?.textContent || '',
        bodyPlanCells: root?.querySelectorAll('.body-plan-grid-v48 > div')?.length || 0,
        bodyPlanText: root?.querySelector('.body-plan-v48')?.textContent || '',
        lineages,
        ancestryEvents: api.getAncestry(),
        originStats: api.getStats(),
      };
    });

    assert(inspected.build === 'surface-v48-morphogenesis-body-plans', `Unexpected build ${inspected.build}`);
    assert(inspected.panelOpen === true && inspected.inspector.open === true, 'Evolution inspector did not open.');
    assert(inspected.options.length >= 1, 'Evolution inspector lineage selector is empty.');
    assert(inspected.speciesTitle.length > 0, 'Evolution inspector did not render the selected lineage name.');
    assert(inspected.ancestry.length > 0, 'Evolution inspector ancestry view is empty.');
    assert(inspected.traitRows === 15, `Expected 15 v47 genome trait rows, found ${inspected.traitRows}.`);
    assert(inspected.summaryCells === 4, `Expected 4 evolution summary metrics, found ${inspected.summaryCells}.`);
    assert(inspected.inspector.lineageBrowser && inspected.inspector.ancestryView && inspected.inspector.liveGenomeDrift && inspected.inspector.gooGridBehaviorMetrics, 'Evolution inspector feature contract is incomplete.');
    assert(inspected.morphology.genomeDrivenMorphology && inspected.morphology.ancestryTree && inspected.morphology.surfaceRendererTouched === false && inspected.morphology.svgOnly, 'v47c morphology contract is incomplete.');
    assert(inspected.morphologySvg && inspected.morphologyShapes >= 2, 'Genome-derived organism schematic did not render.');
    assert(inspected.morphologyCaption.includes('morphology inferred from genome'), 'Morphology schematic is not clearly labeled as genome-derived.');
    assert(inspected.treeSvg && inspected.treeNodes >= 1, 'Evolution tree did not render any lineage nodes.');
    assert(inspected.history.authoritativeFixedStep && inspected.history.causalContextRecorded && inspected.history.environmentalContext && inspected.history.samples >= 1, 'v47d evolutionary history contract is incomplete.');
    assert(inspected.recordStats.authoritativeFixedStep && inspected.recordStats.populationHistory && inspected.recordStats.extinctionTracking && inspected.recordStats.geographicRange && inspected.recordStats.samples >= 1, 'v47e lineage population-record contract is incomplete.');
    assert(inspected.deepTime.reducedOrderEvolutionaryTime && inspected.deepTime.yearsPerBiologyStep === 25000, 'v47f deep-time contract is incomplete.');
    assert(inspected.deepTime.currentYears >= 4900000 && inspected.deepTime.currentYears <= 5500000, `3,000 fixed steps should represent about 5 Myr, got ${inspected.deepTime.currentYears}.`);
    assert(inspected.deepTimeText.includes('Myr') && inspected.deepTimeText.includes('25,000 years'), 'Deep-time UI did not render the geological scale.');
    assert(inspected.morphogenesis.authoritativeFixedStep && inspected.morphogenesis.heritableDevelopmentalTraits && inspected.morphogenesis.plantToAnimalMorphogenesis, 'v48 morphogenesis contract is incomplete.');
    assert(inspected.morphogenesis.traits.length === 9, `Expected 9 v48 developmental traits, got ${inspected.morphogenesis.traits.length}.`);
    assert(inspected.morphogenesis.hardPopulationCap === false && inspected.morphogenesis.surfaceRendererEnabled === false, 'v48 introduced a hard population cap or Surface renderer.');
    assert(inspected.bodyPlanCells === 6, `Expected 6 body-plan inspector cells, found ${inspected.bodyPlanCells}.`);
    assert(inspected.bodyPlanText.includes('Morphogenesis v48') && inspected.bodyPlanText.includes('body plan'), 'v48 body-plan inspector did not render.');
    assert(inspected.originStats.plantLineages >= 1, 'No plant lineage exists for inspection.');
    if (inspected.originStats.motileLineages >= 1) {
      assert(inspected.selected?.startsWith('motile-'), `Motile lineage selection failed: ${inspected.selected}`);
      assert(inspected.behaviorCells >= 1, 'Living behavior section did not render for a motile lineage.');
      assert(inspected.ancestryEvents.some(x => x.childId === inspected.selected), 'Selected motile lineage has no ancestry transition.');
      assert(inspected.treeNodes >= 2, 'Motile lineage tree should include at least its flora ancestor and itself.');
      assert(inspected.milestones.length >= 1, 'Selected motile lineage has no recorded evolutionary milestone.');
      assert(inspected.milestones.every(x => typeof x.context === 'string' && x.context.length > 0), 'A milestone is missing environmental context.');
      assert(inspected.milestoneRows >= 1 && inspected.milestoneText.includes('Context:'), 'Evolutionary milestone history did not render in the inspector.');
      assert(inspected.record && inspected.record.samples.length >= 2, 'Selected motile lineage has insufficient population history.');
      assert(inspected.record.peakPopulation >= 1, 'Selected motile lineage never recorded a real population peak.');
      assert(inspected.recordCard && inspected.recordSparkline, 'Lineage population record did not render its card/sparkline.');
      assert(inspected.recordMeta.includes('range center') && inspected.recordMeta.includes('historical samples'), 'Lineage geographic/history metadata did not render.');
      assert(inspected.selectedPhenotype && inspected.selectedPhenotype.population >= 1, 'Selected motile lineage has no v48 phenotype population.');
      assert(typeof inspected.selectedPhenotype.dominantBodyPlan === 'string' && inspected.selectedPhenotype.dominantBodyPlan.length > 0, 'Selected motile lineage lacks a dominant v48 body plan.');
      assert(Number.isFinite(inspected.selectedPhenotype.animalLikeScore) && inspected.selectedPhenotype.animalLikeScore > 0, 'Selected motile lineage lacks a finite animal-like score.');
      assert(Number.isFinite(inspected.selectedPhenotype.neuralComplexity) && Number.isFinite(inspected.selectedPhenotype.contractility) && Number.isFinite(inspected.selectedPhenotype.digestion), 'Selected v48 body plan lacks developmental averages.');
    }
    assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);

    fs.writeFileSync(path.join(artifactDir, 'evolution-inspector.json'), JSON.stringify({ inspected, pageErrors }, null, 2));
    await page.screenshot({ path: path.join(artifactDir, 'evolution-inspector-v48.png'), fullPage: true });
  } finally {
    await browser.close();
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
})().catch(error => {
  fs.writeFileSync(path.join(artifactDir, 'fatal-error.txt'), `${error.stack || error.message}\n`);
  console.error(error);
  process.exitCode = 1;
});
