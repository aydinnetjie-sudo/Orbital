export function orbitalVelocity(
    centralMass,
    distance
){

    const G = 6.67430e-11;


    return Math.sqrt(
        G *
        centralMass /
        distance
    );

}