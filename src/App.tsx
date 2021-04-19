import { useState, useEffect } from 'react';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { formatNumber } from '@polkadot/util';
import { Event, SignedBlock } from '@polkadot/types/interfaces';

import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import ListGroup from 'react-bootstrap/ListGroup';
// import Spinner from 'react-bootstrap/Spinner';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Alert from 'react-bootstrap/Alert';
import Fade from 'react-bootstrap/Fade';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Col from 'react-bootstrap/esm/Col';

let api: ApiPromise;

const POLKADOT_ENDPOINT = "wss://rpc.polkadot.io" // wss://kusama-rpc.polkadot.io/

type ScannerForm = {
  startBlock: string;
  endBlock: string;
  endpoint: string;
}
type ExtrinsicData = {
    blockNumber: number;
    section: string;
    method: string;
    events: Event[];
}

async function getPreviousHash(signedBlock: SignedBlock, amount: number = 1){
  const blockHash = await api.rpc.chain.getBlockHash(signedBlock.block.header.number.unwrap().subn(amount));
  return blockHash.toHex();
}
async function getEvents(signedBlock : SignedBlock){
  const events = await api.query.system.events.at(signedBlock.block.header.hash.toHex());
  const blockNumber = signedBlock.block.header.number.unwrap().toNumber();

  const extrinsics = signedBlock.block.extrinsics.map(({ method: { method, section } }, index) => {
    const internalEvents = events
      .filter(({ phase }) =>
        phase.isApplyExtrinsic &&
        phase.asApplyExtrinsic.eq(index)
      )
      .map(({ event }) => event);
    return {section, method, events: internalEvents, blockNumber};
  });

  return { extrinsics, blockNumber };
}

function App() {
  const [appStatus, setAppStatus] = useState({
    name: "ok",
    message: ""
  });
  const [isApiInitialized, setApiIsInitialized] = useState(false);
  const [isScanInProgress, setScanIsInProgress] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const [wsAddress, setWsAddress] = useState(POLKADOT_ENDPOINT);
  const [isFormValidated, setFormIsValidated] = useState(false);
  const [formValues, setFormValues] = useState<ScannerForm>({
    startBlock: '',
    endBlock: '',
    endpoint: POLKADOT_ENDPOINT
  });
  const [currentExtrinsics, setCurrentExtrinsics] = useState<ExtrinsicData[]>([]);

  function setEndpoint(endpoint: string) {
    setFormValues({...formValues, endpoint});

    if(endpoint.includes("wss://")){
      setWsAddress(endpoint);
    } else {
      const error = new Error("Wrong format of the endpoint address")
      setAppStatus(error);
    }
  }
  function fetchExtrinsics({startBlockNumber, endBlockNumber, formValuesRef } : {startBlockNumber: number, endBlockNumber: number, formValuesRef: ScannerForm}){
    const blocksToProcess = endBlockNumber - startBlockNumber;

    async function extrinsicsFetcher (signedBlock: SignedBlock, result:ExtrinsicData[] = [] ) : Promise<ExtrinsicData[]>{
      const { extrinsics, blockNumber } = await getEvents(signedBlock); //
      const previousHash = await getPreviousHash(signedBlock);

      const alreadyProcessed = endBlockNumber - blockNumber;
      setScanProgress(Math.floor((alreadyProcessed / blocksToProcess) * 100));
      
      if(formValuesRef.startBlock === signedBlock.block.header.hash.toHex()){
        return [...result, ...extrinsics];
      } else {
        const previuousBlock = await api.rpc.chain.getBlock(previousHash);
        const updatedResult = await extrinsicsFetcher(previuousBlock, [...result, ...extrinsics]);
        return updatedResult;
      }
    }

    return extrinsicsFetcher;
  }

  async function handleSubmit(event: any) {
    event.preventDefault();

    const form = event.currentTarget;
    const clonedFormValues = {...formValues} as ScannerForm;

    if (form.checkValidity() === false) {
      event.stopPropagation();
    } else {
      try {
        setAppStatus({name: "ok", message: ""});
        setScanIsInProgress(true);
        setCurrentExtrinsics([]);
        setScanProgress(0);
    
        const startSignedBlock = await api.rpc.chain.getBlock(clonedFormValues.startBlock);
        const endSignedBlock = await api.rpc.chain.getBlock(clonedFormValues.endBlock);
        const startBlockNumber = startSignedBlock.block.header.number.unwrap().toNumber();
        const endBlockNumber = endSignedBlock.block.header.number.unwrap().toNumber();
    
        if(startBlockNumber >= endBlockNumber){
          throw new Error("The end block must to be greater than the start block")
        }

        const results = await fetchExtrinsics({
          startBlockNumber, endBlockNumber, formValuesRef: clonedFormValues
        })(endSignedBlock);
    
        if(results?.length) {
          setCurrentExtrinsics(results.sort(
            (currentExtrinsic, previousExtrinsic) => 
              currentExtrinsic.blockNumber - previousExtrinsic.blockNumber 
          ));
        }
        setScanIsInProgress(false);
      } catch(e) {
        setAppStatus(e);
        setScanIsInProgress(false);
      }
    }
    setFormIsValidated(true);
  }

  useEffect(()=> {
      async function setFormDefaultValues() {
        const signedLatestBlock = await api.rpc.chain.getBlock();
        const endBlock = signedLatestBlock.block.header.hash.toHex();
        const startBlock = await getPreviousHash(signedLatestBlock, 10);
        setApiIsInitialized(true);
    
        setFormValues({ startBlock, endBlock, endpoint: wsAddress });
      }
      function setWsConnection(wsAddress: string) { 
        const wsProvider = new WsProvider(wsAddress);
      
        api = new ApiPromise({ provider: wsProvider });
        api.on('ready', (): void => {
          setFormDefaultValues();
          setAppStatus({name: "success", message: "Connection established"});
        });
        api.on('error', (e): void => {
          setAppStatus(new Error('Unhandled error'));
        });
      }

      if(api) api.disconnect()
      setWsConnection(wsAddress)
  }, [wsAddress])

  // if (!isApiInitialized) {
  //     return (
  //       <Container fluid className="App">
  //         <Row className="justify-content-md-center">
  //           <Col md="auto">
  //             <Spinner animation="border" role="status">
  //               <span className="sr-only">Loading...</span>
  //             </Spinner>
  //           </Col>
  //         </Row>
  //       </Container>
  //     );
  // } 

  return (
    <Container fluid className="App">
      <div style={{position:"absolute", top: 10, right:10}}>
        <Fade in={appStatus.name !== "ok"} >
          <div className="wrapper">
            <Alert variant={appStatus.name === "Error" ? "danger" : "success"}>
              {wsAddress}: {appStatus.message}
            </Alert>
          </div>
        </Fade>
      </div>
      <h2>polkadot-sc4nner</h2>
      <p>Default values are the last 10 blocks when the app is initialized</p>
      <Row>
        <Col>
          <Form noValidate validated={isFormValidated} onSubmit={handleSubmit}>
            <Form.Group as={Row} controlId="Form.StartBlock">
              <Form.Label column sm="2">
                Start block
              </Form.Label>
              <Col sm="10">
                <Form.Control
                    value={formValues.startBlock}
                    onChange={e => setFormValues({...formValues, startBlock: e.target.value})}
                    size="sm" 
                    type="text" 
                    required
                    disabled={isScanInProgress}
                    placeholder="Start block"
                />
                <Form.Control.Feedback type="invalid">
                  Please provide a valid start block.
                </Form.Control.Feedback>
              </Col>
            </Form.Group>
            <Form.Group as={Row} controlId="Form.EndBlock">
              <Form.Label column sm="2">
                End block
              </Form.Label>
              <Col sm="10">
                <Form.Control 
                  value={formValues.endBlock}
                  onChange={e => setFormValues({...formValues, endBlock: e.target.value})}
                  size="sm"
                  type="text"
                  required
                  disabled={isScanInProgress}
                  placeholder="End block"
                />
                <Form.Control.Feedback type="invalid">
                  Please provide a valid end block.
                </Form.Control.Feedback>
              </Col>
            </Form.Group>
            <Form.Group as={Row} controlId="Form.Endpoint">
              <Form.Label column sm="2">
                Endpoint
              </Form.Label>
              <Col sm="8">
                <Form.Control 
                  size="sm" 
                  required 
                  type="text" 
                  placeholder="Endpoint" 
                  disabled={isScanInProgress}
                  value={formValues.endpoint}
                  onChange={e => setEndpoint(e.target.value)}
                />
                <Form.Control.Feedback type="invalid">
                  Please provide a valid endpoint.
                </Form.Control.Feedback>
              </Col>
              <Col sm="2">
                <Button 
                  size="sm" 
                  block 
                  variant="primary" 
                  type="submit"
                  disabled={isScanInProgress}
                >
                  Scan
                </Button>
              </Col>
            </Form.Group>
          </Form>
          <ProgressBar now={scanProgress} label={`${scanProgress}%`} />
          <Table striped bordered hover>
          <thead>
            <tr>
              <th>block number</th>
              <th>extrinsics</th>
              <th>events</th>
            </tr>
          </thead>
          <tbody>
            {currentExtrinsics.map(({blockNumber, section, method, events}, index) => 
                <tr key={index}>
                  <td>{formatNumber(blockNumber)}</td>
                  <td>{section}.{method}</td>
                  <td>
                    <ListGroup>
                      {events.map((event, index) => {
                        return <ListGroup.Item key={index}>
                            {event.section}.{event.method}
                            <ListGroup.Item>
                                {JSON.stringify(event?.get('data')?.toHuman())}
                            </ListGroup.Item>
                          </ListGroup.Item>
                      }
                      )}
                    </ListGroup>
                  </td>
                </tr>
            )}
          </tbody>
          </Table>
        </Col>
      </Row>
    </Container>
  );
}

export default App;